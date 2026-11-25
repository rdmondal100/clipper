import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ManifestSchema, ProjectSchema } from "@shared/schemas";
import type { StageName } from "@shared/schemas";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Pipeline, PipelineDeps } from "../../src/main/pipeline";
import { silentLogger } from "../../src/main/pipeline/log";
import { createProject, emptyManifest, readJsonFile, writeJsonAtomic } from "../../src/main/pipeline/project";
import { createRunner } from "../../src/main/pipeline/runner";
import type { Stage, StageContext } from "../../src/main/pipeline/stage";
import { parseClipArgs } from "./args";
import type { ClipArgs } from "./args";
import { createReporter } from "./output";
import { runClip } from "./run";
import type { CliDeps } from "./run";

const EXE = process.platform === "win32" ? ".exe" : "";
// Bangla and Hindi in one name: the source path is stored byte for byte (SPEC-010)
const VIDEO_NAME = "আলোচনা और चर्चा.mp4";

let root: string;
let appDir: string;
let cwd: string;
let binDir: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "clipper-cli-"));
  appDir = join(root, "app");
  cwd = join(root, "work"); // the folder the user typed the command in, not process.cwd()
  binDir = join(root, "bin");
  await mkdir(appDir);
  await mkdir(join(cwd, "videos"), { recursive: true });
  await mkdir(binDir);
  await writeFile(join(cwd, "videos", VIDEO_NAME), "not really a video");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function args(argv: string[]): ClipArgs {
  const parsed = parseClipArgs(argv);
  if (parsed.kind !== "run") throw new Error(`bad test args: ${JSON.stringify(parsed)}`);
  return parsed.args;
}

function fakeStage(name: StageName, run?: Stage["run"]): Stage {
  const perClip = ["reframe", "captions", "render"].includes(name);
  return {
    name,
    version: 1,
    perClip,
    readsSource: false,
    settingsKey: () => null,
    run:
      run ??
      (async (ctx: StageContext, clipId?: string) => {
        const file = join(ctx.dir.dir, "stages", `${name}${clipId ? `-${clipId}` : ""}.out`);
        await writeFile(file, "done");
        return { outputs: [file] };
      }),
  };
}

// the real runner with fake stages, shaped like createPipeline's result
function withStages(stages: Stage[]) {
  return (deps: PipelineDeps): Pipeline => ({ ...createRunner({ stages, log: deps.log }), stages: stages.map((stage) => stage.name) });
}

async function touchBins(...names: string[]) {
  for (const name of names) await writeFile(join(binDir, `${name}${EXE}`), "");
}

async function run(argv: string[], options: Partial<Pick<CliDeps, "createPipeline" | "signal">> & { json?: boolean } = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const parsed = args(argv);
  const reporter = createReporter({
    json: options.json ?? parsed.json,
    debug: false,
    write: { out: (line) => out.push(line), err: (line) => err.push(line) },
  });
  const code = await runClip(parsed, {
    appDir,
    cwd,
    env: { CLIPPER_BIN_DIR: binDir },
    signal: options.signal ?? new AbortController().signal,
    reporter,
    createPipeline: options.createPipeline,
  });
  return { code, out, err, text: [...out, ...err].join("\n") };
}

async function projectFolders(projectsRoot = join(appDir, ".projects")) {
  return existsSync(projectsRoot) ? readdir(projectsRoot) : [];
}

describe("runClip, M0 skeleton", () => {
  it("with zero stages, creates a project folder with project.json and an empty manifest, exit 0", async () => {
    const result = await run([`videos/${VIDEO_NAME}`, "--lang", "en"]);

    expect(result.code).toBe(0);
    const [id, ...others] = await projectFolders();
    expect(others).toEqual([]);
    const dir = join(appDir, ".projects", id ?? "");
    const project = await readJsonFile(join(dir, "project.json"), ProjectSchema, silentLogger);
    expect(project).toMatchObject({
      id,
      language: "en",
      source: { path: join(cwd, "videos", VIDEO_NAME), copied: false },
      settings: { clipCount: 10, minSec: 20, maxSec: 60, presets: ["youtube-shorts"] },
    });
    expect(await readJsonFile(join(dir, "manifest.json"), ManifestSchema, silentLogger)).toEqual(emptyManifest());
    expect(result.out).toContain(`Created project ${id}: ${dir}`);
    expect(result.text).toContain(`Done. Project folder: ${dir}`);
    expect(result.text).toContain("No exported files yet.");
  });

  it.each(["bn", "hi"] as const)("stores --lang %s and the chosen settings", async (lang) => {
    const result = await run([`videos/${VIDEO_NAME}`, "--lang", lang, "--clips", "4", "--preset", "tiktok"]);
    expect(result.code).toBe(0);
    const [id] = await projectFolders();
    const project = await readJsonFile(join(appDir, ".projects", id ?? "", "project.json"), ProjectSchema, silentLogger);
    expect(project).toMatchObject({ language: lang, settings: { clipCount: 4, presets: ["tiktok"] } });
  });

  it("resolves --projects-dir against the user's folder", async () => {
    const result = await run([`videos/${VIDEO_NAME}`, "--lang", "bn", "--projects-dir", "my-projects"]);
    expect(result.code).toBe(0);
    expect(await projectFolders(join(cwd, "my-projects"))).toHaveLength(1);
    expect(await projectFolders()).toEqual([]);
  });

  it("exits 2 for a missing video and creates nothing", async () => {
    const result = await run(["videos/nope.mp4", "--lang", "en"]);
    expect(result.code).toBe(2);
    expect(result.err).toEqual([`error: Video not found: ${join(cwd, "videos", "nope.mp4")}`]);
    expect(await projectFolders()).toEqual([]);
  });

  it("exits 2 when the video is a folder", async () => {
    const result = await run(["videos", "--lang", "en"]);
    expect(result.code).toBe(2);
    expect(result.text).toContain("Video not found");
  });
});

describe("runClip --project", () => {
  async function existing(language: "bn" | "en" | "hi" = "bn") {
    const { project } = await createProject({
      root: join(appDir, ".projects"),
      sourcePath: join(cwd, "videos", VIDEO_NAME),
      language,
      settings: { clipCount: 3, minSec: 20, maxSec: 60, presets: ["youtube-shorts"] },
    });
    return project;
  }

  it("reuses the project instead of creating one", async () => {
    const project = await existing();
    const result = await run(["--project", project.id]);
    expect(result.code).toBe(0);
    expect(await projectFolders()).toEqual([project.id]);
    expect(result.out[0]).toBe(`Opened project ${project.id}: ${join(appDir, ".projects", project.id)}`);
  });

  it("accepts a matching --lang and refuses a different one", async () => {
    const project = await existing("hi");
    expect((await run(["--project", project.id, "--lang", "hi"])).code).toBe(0);
    const result = await run(["--project", project.id, "--lang", "en"]);
    expect(result.code).toBe(2);
    expect(result.text).toContain(`Project ${project.id} is in "hi", not "en"`);
  });

  it("exits 2 for an unknown project", async () => {
    const result = await run(["--project", "20260101-000000-zzzzzz"]);
    expect(result.code).toBe(2);
    expect(result.text).toContain(`No Clipper project "20260101-000000-zzzzzz" in ${join(appDir, ".projects")}`);
  });
});

describe("runClip with stages", () => {
  it("exits 2 when a stage this run reaches needs a missing binary, before creating a project (R4)", async () => {
    const result = await run([`videos/${VIDEO_NAME}`, "--lang", "en"], { createPipeline: withStages([fakeStage("ingest")]) });
    expect(result.code).toBe(2);
    expect(result.text).toContain(`Missing ffmpeg${EXE}, ffprobe${EXE} in ${binDir}`);
    expect(result.text).toContain("npm run check:bins");
    expect(await projectFolders()).toEqual([]);
  });

  it("checks whisper-cli only for local transcription, and nothing past --to", async () => {
    const pipeline = withStages([fakeStage("transcribe"), fakeStage("snap"), fakeStage("render")]);
    const local = await run([`videos/${VIDEO_NAME}`, "--lang", "bn", "--to", "transcribe"], { createPipeline: pipeline });
    expect(local.code).toBe(2);
    expect(local.text).toContain(`Missing whisper-cli${EXE} in`);

    const cloud = await run([`videos/${VIDEO_NAME}`, "--lang", "bn", "--to", "transcribe", "--transcriber", "openai-compatible-transcription"], {
      createPipeline: pipeline,
    });
    expect(cloud.code).toBe(0);
    expect(cloud.text).toContain("Running transcribe");
    expect(cloud.text).not.toContain("Running snap");
  });

  it("prints progress lines and lists the exported files from the manifest (R5, R6)", async () => {
    await touchBins("ffmpeg");
    const snap = fakeStage("snap", async (ctx) => {
      const clip = { candidateId: "c01", start: 0, end: 30, firstSegment: 0, lastSegment: 1, title: "শিরোনাম", hook: "হুক", total: 80, flags: [] };
      await writeJsonAtomic(ctx.dir.clips, { schemaVersion: 1, clips: [{ ...clip, id: "c01" }, { ...clip, id: "c02" }] });
      await writeFile(ctx.dir.exportVideo("c09", "tiktok"), "left over from an older run");
      return { outputs: [ctx.dir.clips] };
    });
    const render = fakeStage("render", async (ctx, clipId) => {
      const file = ctx.dir.exportVideo(clipId ?? "", "youtube-shorts");
      await writeFile(file, "mp4");
      return { outputs: [file] };
    });
    const result = await run([`videos/${VIDEO_NAME}`, "--lang", "en"], { createPipeline: withStages([snap, render]) });

    expect(result.code).toBe(0);
    const [id] = await projectFolders();
    const exports = join(appDir, ".projects", id ?? "", "exports");
    expect(result.out).toContain("[snap] 0%");
    expect(result.out).toContain("[render c02] 100%");
    expect(result.text).toContain(`Exported:\n  ${join(exports, "c01_youtube-shorts.mp4")}\n  ${join(exports, "c02_youtube-shorts.mp4")}`);
    expect(result.text).not.toContain("c09"); // on disk, but no manifest record points at it
  });

  it("exits 1 when a stage fails, with the error and how to resume", async () => {
    const failing = fakeStage("segment", async () => {
      throw new Error("no words in the transcript");
    });
    const result = await run([`videos/${VIDEO_NAME}`, "--lang", "hi", "--projects-dir", "p"], { createPipeline: withStages([failing]) });

    expect(result.code).toBe(1);
    const [id] = await projectFolders(join(cwd, "p"));
    expect(result.err).toEqual(["error: segment failed: no words in the transcript", `To resume after fixing it: npm run clip -- --project ${id} --projects-dir "p"`]);
  });

  it("exits 130 when cancelled, after the running stage has stopped (R3)", async () => {
    const controller = new AbortController();
    let stopped = false;
    const slow = fakeStage("segment", (ctx) => {
      return new Promise((_resolve, reject) => {
        ctx.signal.addEventListener("abort", () => {
          stopped = true;
          reject(new Error("aborted"));
        });
        controller.abort(); // the user presses Ctrl+C while the stage runs
      });
    });
    const result = await run([`videos/${VIDEO_NAME}`, "--lang", "en"], { createPipeline: withStages([slow]), signal: controller.signal });

    expect(result.code).toBe(130);
    expect(stopped).toBe(true);
    const [id] = await projectFolders();
    expect(result.err).toContain(`Cancelled. To resume: npm run clip -- --project ${id}`);
  });

  it("exits 130 without running anything when cancelled before the run starts", async () => {
    const controller = new AbortController();
    controller.abort();
    let ran = false;
    const stage = fakeStage("segment", async () => {
      ran = true;
      return { outputs: [] };
    });
    const result = await run([`videos/${VIDEO_NAME}`, "--lang", "en"], { createPipeline: withStages([stage]), signal: controller.signal });
    expect(result.code).toBe(130);
    expect(ran).toBe(false);
  });

  it("passes --force to the runner", async () => {
    const pipeline = withStages([fakeStage("segment"), fakeStage("snap", async () => ({ outputs: [] }))]);
    await run([`videos/${VIDEO_NAME}`, "--lang", "en", "--to", "segment"], { createPipeline: pipeline });
    const [id] = await projectFolders();
    const again = await run(["--project", id ?? "", "--force", "segment"], { createPipeline: pipeline });
    expect(again.code).toBe(0);
    expect(again.text).toContain("Running segment");
  });

  it("warns once about M1 options that have no stage yet", async () => {
    const result = await run([`videos/${VIDEO_NAME}`, "--lang", "en", "--llm", "ollama:some-model", "--whisper-model", "small"]);
    expect(result.code).toBe(0);
    expect(result.err).toEqual(["warning: Ignored for now (the stages that use them aren't built yet): --llm, --whisper-model"]);
  });

  it("--json writes only JSON lines on stdout and ends with the result", async () => {
    const result = await run([`videos/${VIDEO_NAME}`, "--lang", "en", "--json"], { createPipeline: withStages([fakeStage("segment")]) });

    expect(result.code).toBe(0);
    expect(result.err).toEqual([]);
    const events = result.out.map((line) => JSON.parse(line) as { type: string; exitCode?: number });
    expect(events[0]).toMatchObject({ type: "project", created: true });
    expect(events.some((event) => event.type === "progress")).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: "result", exitCode: 0, exports: [] });
  });
});
