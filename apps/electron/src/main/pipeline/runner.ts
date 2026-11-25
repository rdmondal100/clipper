import { createHash } from "node:crypto";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import { ClipsSchema } from "@shared/schemas";
import type { Clip, Manifest, Project, StageName, StageRecord } from "@shared/schemas";
import { openJobLog } from "./jobLog";
import type { Logger } from "./log";
import { createProgress } from "./progress";
import type { ProgressUpdate } from "./progress";
import {
  checkSource,
  createProjectId,
  missingOutputs,
  projectPaths,
  readJsonFile,
  readManifest,
  readProject,
  recordStage,
  removeTmpFiles,
  sourceFilePath,
  writeManifest,
} from "./project";
import type { ProjectPaths } from "./project";
import { STAGE_ORDER, stageIndex } from "./stage";
import type { Stage, StageContext, StageRef } from "./stage";

type RunOptions = {
  from?: StageName; // rerun this stage and everything after it
  to?: StageName; // stop after this stage
  force?: StageName[];
  clipIds?: string[]; // limits per-clip stages to these clips
  jobId?: string; // names logs/job-<jobId>.log; generated when omitted (CLI)
  signal: AbortSignal;
  onProgress?: (update: ProgressUpdate) => void;
};

type RunResult =
  | { ok: true; jobId: string; ran: StageRef[]; skipped: StageRef[] }
  | {
      ok: false;
      cancelled?: false;
      jobId: string;
      stage: StageName;
      clipId?: string;
      message: string;
      sourceMissing?: true; // SPEC-020 R11: the app offers to relink the video
    }
  | { ok: false; cancelled: true; jobId: string };

type RunnerDeps = { stages: Stage[]; log: Logger; now?: () => number };

// R1: a wrong order would silently break the hash chain, so fail when the pipeline is built
function checkStageOrder(stages: Stage[]) {
  stages.forEach((stage, index) => {
    const previous = stages[index - 1];
    if (!previous) return;
    if (stageIndex(stage.name) <= stageIndex(previous.name)) {
      throw new Error(`Stages must follow the order ${STAGE_ORDER.join(", ")}, once each: got ${previous.name} then ${stage.name}`);
    }
    if (previous.perClip && !stage.perClip) {
      throw new Error(`Whole-project stage ${stage.name} can't come after per-clip stage ${previous.name}`);
    }
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// R2: key order in settingsKey must not change the hash
function hashOf(value: unknown) {
  const json = JSON.stringify(value, (_key, inner: unknown) =>
    isPlainObject(inner)
      ? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : inner,
  );
  return createHash("sha256").update(json ?? "null").digest("hex");
}

// R2: ingest's "previous"; path, size and mtime stand in for hashing a multi-GB file
function sourceFingerprint(project: Project) {
  const { path, sizeBytes, mtimeMs } = project.source;
  return hashOf({ path, sizeBytes, mtimeMs });
}

function stageHash(stage: Stage, project: Project, previous: string, clip?: Clip) {
  return hashOf({ version: stage.version, settings: stage.settingsKey(project) ?? null, previous, clip });
}

// stages may return ProjectPaths (absolute); the manifest stores project-relative paths with "/"
function toProjectRelative(dir: string, output: string) {
  const path = relative(dir, resolve(dir, output));
  if (path === "" || path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path)) {
    throw new Error(`Stage output ${basename(output)} is outside the project folder`);
  }
  return path.split(sep).join("/");
}

// R3: once a stage reruns, whatever came after it is stale even if its inputHash still matches
function dropRecordsFrom(manifest: Manifest, stage: StageName, clipId?: string) {
  const stale = STAGE_ORDER.slice(stageIndex(stage));
  const clipRecords = clipId === undefined ? Object.values(manifest.clips) : [manifest.clips[clipId] ?? {}];
  const groups = clipId === undefined ? [manifest.stages, ...clipRecords] : clipRecords;
  let changed = false;
  for (const records of groups) {
    for (const name of stale) {
      if (records[name] === undefined) continue;
      delete records[name];
      changed = true;
    }
  }
  return changed;
}

// R10: clip ids come from snap's clips.json; asking for a clip that isn't there is a caller bug
async function selectClips(paths: ProjectPaths, clipIds: string[] | undefined, log: Logger) {
  const file = await readJsonFile(paths.clips, ClipsSchema, log);
  if (!file) return { ok: false, message: "stages/clips.json is missing or invalid, so there are no clips to process" } as const;
  if (!clipIds) return { ok: true, clips: file.clips } as const;
  const unknown = clipIds.filter((id) => !file.clips.some((clip) => clip.id === id));
  if (unknown.length > 0) return { ok: false, message: `Unknown clip: ${unknown.join(", ")}` } as const;
  return { ok: true, clips: file.clips.filter((clip) => clipIds.includes(clip.id)) } as const;
}

function describeRef(ref: StageRef) {
  return ref.clipId === undefined ? ref.stage : `${ref.stage} ${ref.clipId}`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

const SOURCE_MESSAGES = {
  missing: "The source video can't be found. Relink it to continue.",
  changed: "The source video changed since the project was created. Relink it to continue.",
};

type Job = { paths: ProjectPaths; project: Project; jobId: string; log: Logger; options: RunOptions };

// SPEC-020: runs stages in order with caching, resume, progress and cancel
function createRunner(deps: RunnerDeps) {
  checkStageOrder(deps.stages);
  const now = deps.now ?? Date.now;

  async function runJob(job: Job): Promise<RunResult> {
    const { paths, project, jobId, log, options } = job;
    const lastIndex = options.to === undefined ? STAGE_ORDER.length - 1 : stageIndex(options.to);
    const stages = deps.stages.filter((stage) => stageIndex(stage.name) <= lastIndex);
    const progress = createProgress({ stages, now, onProgress: options.onProgress });
    const ran: StageRef[] = [];
    const skipped: StageRef[] = [];
    let manifest = await readManifest(paths, log);

    const isForced = (stage: Stage) =>
      options.force?.includes(stage.name) === true ||
      (options.from !== undefined && stageIndex(stage.name) >= stageIndex(options.from));

    async function cancelled(): Promise<RunResult> {
      await removeTmpFiles(paths.dir); // R6
      log.warn(`Job ${jobId} cancelled`);
      return { ok: false, cancelled: true, jobId };
    }

    function failed(ref: StageRef, message: string, extra: { sourceMissing?: true } = {}): RunResult {
      log.error(`${describeRef(ref)} failed: ${message}`);
      return { ok: false, jobId, ...ref, message, ...extra };
    }

    // runs or skips one unit; a returned result ends the run
    async function runUnit(stage: Stage, ref: StageRef, inputHash: string): Promise<RunResult | undefined> {
      if (options.signal.aborted) return cancelled();
      progress.start(ref);

      const record = ref.clipId === undefined ? manifest.stages[stage.name] : manifest.clips[ref.clipId]?.[stage.name];
      if (!isForced(stage) && record?.inputHash === inputHash) {
        if ((await missingOutputs(paths.dir, record.outputs)).length === 0) {
          skipped.push(ref);
          progress.complete(ref);
          log.info(`Skipped ${describeRef(ref)} (cached)`);
          return undefined;
        }
      }

      if (stage.readsSource) {
        const source = await checkSource(paths, project);
        if (!source.ok) return failed(ref, SOURCE_MESSAGES[source.reason], { sourceMissing: true });
      }
      if (dropRecordsFrom(manifest, stage.name, ref.clipId)) await writeManifest(paths, manifest);

      log.info(`Running ${describeRef(ref)}`);
      const startedAt = now();
      let current = true; // a stage reporting after it settled must not move progress
      const ctx: StageContext = {
        dir: paths,
        project,
        signal: options.signal,
        log,
        progress: (fraction, note) => {
          if (current) progress.update(ref, fraction, note);
        },
      };
      try {
        const result = await stage.run(ctx, ref.clipId);
        const done: StageRecord = {
          version: stage.version,
          inputHash,
          outputs: result.outputs.map((output) => toProjectRelative(paths.dir, output)),
          completedAt: new Date(now()).toISOString(),
          durationMs: Math.max(0, now() - startedAt), // the wall clock can step back (NTP)
        };
        manifest = await recordStage(paths, { stage: stage.name, clipId: ref.clipId, record: done }, log);
      } catch (error) {
        if (options.signal.aborted) return cancelled();
        log.debug(`${describeRef(ref)} stack`, error instanceof Error ? error.stack : undefined);
        return failed(ref, errorMessage(error));
      } finally {
        current = false;
      }

      ran.push(ref);
      progress.complete(ref);
      log.info(`Finished ${describeRef(ref)} in ${((now() - startedAt) / 1000).toFixed(1)} s`);
      return undefined;
    }

    log.info(`Job ${jobId} for project ${project.id}: ${stages.map((stage) => stage.name).join(", ") || "no stages"}`);

    let previous = sourceFingerprint(project);
    for (const stage of stages.filter((candidate) => !candidate.perClip)) {
      const inputHash = stageHash(stage, project, previous);
      const stop = await runUnit(stage, { stage: stage.name }, inputHash);
      if (stop) return stop;
      previous = inputHash;
    }

    const clipStages = stages.filter((stage) => stage.perClip);
    const firstClipStage = clipStages[0];
    if (firstClipStage) {
      const selected = await selectClips(paths, options.clipIds, log);
      if (!selected.ok) return failed({ stage: firstClipStage.name }, selected.message);
      progress.setClipCount(selected.clips.length);
      // R10: clip by clip, so the first finished clip is ready sooner
      for (const clip of selected.clips) {
        let clipPrevious = previous;
        for (const stage of clipStages) {
          const inputHash = stageHash(stage, project, clipPrevious, clip);
          const stop = await runUnit(stage, { stage: stage.name, clipId: clip.id }, inputHash);
          if (stop) return stop;
          clipPrevious = inputHash;
        }
      }
    }

    progress.finish();
    log.info(`Job ${jobId} done: ${ran.length} ran, ${skipped.length} skipped`);
    return { ok: true, jobId, ran, skipped };
  }

  async function run(projectDir: string, options: RunOptions): Promise<RunResult> {
    const paths = projectPaths(projectDir);
    const project = await readProject(paths.dir, deps.log); // not a project folder: a caller bug, so it throws
    await removeTmpFiles(paths.dir); // R12
    const jobId = options.jobId ?? createProjectId(new Date(now())); // same sortable ASCII shape as project ids
    const jobLog = await openJobLog(paths.jobLog(jobId), {
      base: deps.log,
      now,
      redact: { [paths.dir]: "<project>", [sourceFilePath(paths, project)]: "<source>" },
    });
    try {
      return await runJob({ paths, project, jobId, log: jobLog.log, options });
    } finally {
      await jobLog.close();
    }
  }

  return { run };
}

type Runner = ReturnType<typeof createRunner>;

export { createRunner };
export type { RunOptions, RunResult, Runner, StageRef };
