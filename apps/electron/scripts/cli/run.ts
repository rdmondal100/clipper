// SPEC-160: create or open a project, run the same pipeline as the app, report the result.
import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Project, StageName } from "@shared/schemas";
import type { Bins } from "../../src/main/media";
import { createPipeline } from "../../src/main/pipeline";
import type { Pipeline, PipelineDeps } from "../../src/main/pipeline";
import { createProject, projectPaths, readManifest, readProject } from "../../src/main/pipeline/project";
import type { ProjectPaths } from "../../src/main/pipeline/project";
import { stageIndex } from "../../src/main/pipeline/stage";
import type { ClipArgs, ClipTarget, TranscriberKind } from "./args";
import type { CliResult, Reporter } from "./output";

type CliDeps = {
  appDir: string; // apps/electron: default projects folder and resources
  cwd: string; // where the user typed the command, for relative paths they give
  env: Record<string, string | undefined>;
  signal: AbortSignal;
  reporter: Reporter;
  createPipeline?: (deps: PipelineDeps) => Pipeline; // tests pass fake stages
};

const EXE = process.platform === "win32" ? ".exe" : "";

const BIN_FILES: Record<keyof Bins, string> = {
  ffmpeg: `ffmpeg${EXE}`,
  ffprobe: `ffprobe${EXE}`,
  whisperCli: `whisper-cli${EXE}`,
  ytDlp: `yt-dlp${EXE}`,
};

// which binaries each stage spawns (SPEC-030, SPEC-040, SPEC-100); add a stage here when it spawns one
function binsForStage(stage: StageName, transcriber: TranscriberKind): (keyof Bins)[] {
  if (stage === "ingest") return ["ffmpeg", "ffprobe"];
  if (stage === "transcribe") return transcriber === "whisper-local" ? ["whisperCli"] : [];
  if (stage === "render") return ["ffmpeg"];
  return [];
}

// R4: only the binaries this run can reach, so an M0 run with no stages needs none
function missingBins(bins: Bins, stages: StageName[], args: ClipArgs) {
  const last = args.to === undefined ? Infinity : stageIndex(args.to);
  const needed = new Set(stages.filter((stage) => stageIndex(stage) <= last).flatMap((stage) => binsForStage(stage, args.transcriber)));
  return [...needed].filter((name) => !existsSync(bins[name]));
}

function binsIn(dir: string): Bins {
  return {
    ffmpeg: join(dir, BIN_FILES.ffmpeg),
    ffprobe: join(dir, BIN_FILES.ffprobe),
    whisperCli: join(dir, BIN_FILES.whisperCli),
    ytDlp: join(dir, BIN_FILES.ytDlp),
  };
}

// the command that picks this project up again, for failure and cancel messages
function resumeCommand(projectId: string, args: ClipArgs) {
  const dir = args.projectsDir === undefined ? "" : ` --projects-dir "${args.projectsDir}"`;
  return `npm run clip -- --project ${projectId}${dir}`;
}

// R6: only files backed by a manifest record, so leftovers of an older run aren't listed
async function exportedFiles(paths: ProjectPaths, reporter: Reporter) {
  const manifest = await readManifest(paths, reporter.log);
  const outputs = Object.values(manifest.clips).flatMap((records) => records.render?.outputs ?? []);
  return [...new Set(outputs)]
    .filter((output) => output.startsWith("exports/"))
    .sort()
    .map((output) => join(paths.dir, ...output.split("/")));
}

type Opened = { ok: true; project: Project; dir: string; created: boolean } | { ok: false; message: string };

async function openProject(target: ClipTarget, projectsRoot: string, deps: CliDeps): Promise<Opened> {
  if (target.kind === "existing") {
    const dir = resolve(projectsRoot, target.projectId);
    let project: Project;
    try {
      project = await readProject(dir, deps.reporter.log);
    } catch {
      return { ok: false, message: `No Clipper project "${target.projectId}" in ${projectsRoot}.` };
    }
    // the language is part of the transcribe hash; changing it is a new project, not a flag
    if (target.language !== undefined && target.language !== project.language) {
      return { ok: false, message: `Project ${project.id} is in "${project.language}", not "${target.language}". Drop --lang or start a new project.` };
    }
    return { ok: true, project, dir, created: false };
  }

  const video = resolve(deps.cwd, target.video);
  const info = await stat(video).catch(() => undefined);
  if (!info?.isFile()) return { ok: false, message: `Video not found: ${video}` };
  const { project, paths } = await createProject({ root: projectsRoot, sourcePath: video, language: target.language, settings: target.settings });
  return { ok: true, project, dir: paths.dir, created: true };
}

function badArgs(reporter: Reporter, message: string) {
  const result: CliResult = { exitCode: 2, message };
  reporter.result(result);
  return result.exitCode;
}

// returns the exit code (R4); throws only on unexpected errors, which the entry point turns into 1
async function runClip(args: ClipArgs, deps: CliDeps): Promise<number> {
  const { reporter, signal } = deps;
  const binDir = deps.env.CLIPPER_BIN_DIR ? resolve(deps.cwd, deps.env.CLIPPER_BIN_DIR) : join(deps.appDir, "resources", "bin", "win-x64");
  const projectsRoot = args.projectsDir === undefined ? join(deps.appDir, ".projects") : resolve(deps.cwd, args.projectsDir);

  const pipeline = (deps.createPipeline ?? createPipeline)({
    bins: binsIn(binDir),
    fontsDir: join(deps.appDir, "resources", "fonts"),
    modelsDir: join(deps.appDir, "resources", "models"),
    presets: [], // SPEC-100: load and parse resources/presets.json
    log: reporter.log,
  });

  // checked before a project exists, so a run that can't start leaves no folder behind
  const missing = missingBins(binsIn(binDir), pipeline.stages, args);
  if (missing.length > 0) {
    const files = missing.map((name) => BIN_FILES[name]).join(", ");
    return badArgs(reporter, `Missing ${files} in ${binDir}. Run "npm run check:bins" to see where to get them.`);
  }

  const opened = await openProject(args.target, projectsRoot, deps);
  if (!opened.ok) return badArgs(reporter, opened.message);
  const { project, dir, created } = opened;
  reporter.project({ id: project.id, dir, created });
  if (args.pending.length > 0) {
    reporter.log.warn(`Ignored for now (the stages that use them aren't built yet): ${args.pending.join(", ")}`);
  }

  const resume = resumeCommand(project.id, args);
  if (signal.aborted) {
    reporter.result({ exitCode: 130, projectId: project.id, resume });
    return 130;
  }

  const result = await pipeline.run(dir, {
    to: args.to,
    force: args.force,
    signal,
    onProgress: reporter.progress,
  });

  if (result.ok) {
    const exports = await exportedFiles(projectPaths(dir), reporter);
    reporter.result({ exitCode: 0, projectId: project.id, projectDir: dir, exports });
    return 0;
  }
  if (result.cancelled) {
    reporter.result({ exitCode: 130, projectId: project.id, resume });
    return 130;
  }
  reporter.result({
    exitCode: 1,
    projectId: project.id,
    stage: result.stage,
    ...(result.clipId === undefined ? {} : { clipId: result.clipId }),
    message: result.message,
    ...(result.sourceMissing ? { sourceMissing: true } : {}),
    resume,
  });
  return 1;
}

export { runClip };
export type { CliDeps };
