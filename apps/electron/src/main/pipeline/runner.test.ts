import { appendFile, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Clip, StageName } from "@shared/schemas";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { silentLogger } from "./log";
import { createProject, readManifest, readProject, writeJsonAtomic } from "./project";
import type { ProjectPaths } from "./project";
import { createRunner } from "./runner";
import type { RunOptions, RunResult, Runner } from "./runner";
import { STAGE_ORDER } from "./stage";
import type { Stage, StageContext, StageRef } from "./stage";

const PER_CLIP: readonly StageName[] = ["reframe", "captions", "render"];
const PROJECT_STAGES = ["ingest", "transcribe", "segment", "highlights", "snap"];
const CLIP_IDS = ["c01", "c02", "c03"];
// R10: clip by clip, each clip through all per-clip stages before the next one starts
const CLIP_UNITS = CLIP_IDS.flatMap((id) => PER_CLIP.map((stage) => `${stage}:${id}`));
const ALL_UNITS = [...PROJECT_STAGES, ...CLIP_UNITS];

let root: string;
let sourcePath: string;
let paths: ProjectPaths;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "clipper-runner-"));
  sourcePath = join(root, "আলোচনা talk.mp4");
  await writeFile(sourcePath, "not really a video");
  ({ paths } = await createProject({
    root: join(root, "projects"),
    sourcePath,
    language: "bn",
    settings: { clipCount: 3, minSec: 20, maxSec: 60, presets: ["youtube-shorts"] },
  }));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

type Overrides = Partial<Pick<Stage, "version" | "settingsKey" | "run" | "readsSource">>;

function clipEntry(id: string, start: number): Clip {
  return { id, candidateId: id, start, end: start + 30, firstSegment: 0, lastSegment: 1, title: "শিরোনাম", hook: "হুক", total: 80, flags: [] };
}

function clipsFile(starts: Record<string, number>) {
  return { schemaVersion: 1, clips: Object.entries(starts).map(([id, start]) => clipEntry(id, start)) };
}

// every fake writes a real output file, so R3 (outputs exist) and R8 (record after outputs) are exercised
function defaultRun(name: StageName) {
  return async (ctx: StageContext, clipId?: string) => {
    ctx.progress(0.5, "halfway");
    if (name === "snap") {
      await writeJsonAtomic(ctx.dir.clips, clipsFile({ c01: 0, c02: 100, c03: 200 }));
      return { outputs: [ctx.dir.clips] };
    }
    const file = join(ctx.dir.dir, "stages", `${name}${clipId ? `-${clipId}` : ""}.out`);
    await writeFile(file, "done");
    return { outputs: [file] };
  };
}

function fakeStages(
  calls: string[],
  overrides: Partial<Record<StageName, Overrides>> = {},
  names: readonly StageName[] = STAGE_ORDER,
): Stage[] {
  return names.map((name) => {
    const custom = overrides[name] ?? {};
    const run = custom.run ?? defaultRun(name);
    return {
      name,
      version: custom.version ?? 1,
      perClip: PER_CLIP.includes(name),
      readsSource: custom.readsSource ?? (name === "ingest" || name === "render"),
      settingsKey: custom.settingsKey ?? ((project) => ({ language: project.language })),
      run: async (ctx, clipId) => {
        calls.push(clipId ? `${name}:${clipId}` : name);
        return run(ctx, clipId);
      },
    };
  });
}

function labels(refs: StageRef[]) {
  return refs.map((ref) => (ref.clipId ? `${ref.stage}:${ref.clipId}` : ref.stage));
}

function run(runner: Runner, options: Partial<RunOptions> = {}) {
  return runner.run(paths.dir, { signal: new AbortController().signal, ...options });
}

function ok(result: RunResult) {
  if (!result.ok) throw new Error(`Run failed: ${JSON.stringify(result)}`);
  return result;
}

async function exists(path: string) {
  return stat(path).then(
    () => true,
    () => false,
  );
}

describe("createRunner (R1)", () => {
  it.each([
    ["out of order", ["transcribe", "ingest"]],
    ["repeated", ["ingest", "ingest"]],
  ] as const)("throws when stages are %s", (_label, names) => {
    expect(() => createRunner({ stages: fakeStages([], {}, names), log: silentLogger })).toThrow(/order/);
  });

  it("throws when a whole-project stage comes after a per-clip one", () => {
    const [reframe, render] = fakeStages([], {}, ["reframe", "render"]);
    expect(() => createRunner({ stages: [reframe!, { ...render!, perClip: false }], log: silentLogger })).toThrow(
      /per-clip/,
    );
  });
});

describe("caching and resume", () => {
  it("runs every stage once, then skips all of them on a second run", async () => {
    const calls: string[] = [];
    const runner = createRunner({ stages: fakeStages(calls), log: silentLogger });

    const first = ok(await run(runner));
    expect(calls).toEqual(ALL_UNITS);
    expect(labels(first.ran)).toEqual(ALL_UNITS);

    calls.length = 0;
    const second = ok(await run(runner));
    expect(calls).toEqual([]);
    expect(second.ran).toEqual([]);
    expect(labels(second.skipped)).toEqual(ALL_UNITS);
  });

  it("reruns segment and every later stage, not earlier ones, when a segment setting changes", async () => {
    const calls: string[] = [];
    const segment = { settingsKey: (project: { settings: { minSec: number } }) => ({ minSec: project.settings.minSec }) };
    const runner = createRunner({ stages: fakeStages(calls, { segment }), log: silentLogger });
    ok(await run(runner));

    const project = await readProject(paths.dir, silentLogger);
    await writeJsonAtomic(paths.project, { ...project, settings: { ...project.settings, minSec: 25 } });
    calls.length = 0;
    const second = ok(await run(runner));
    expect(calls).toEqual(ALL_UNITS.slice(2));
    expect(labels(second.skipped)).toEqual(["ingest", "transcribe"]);
  });

  it("ignores key order in settingsKey (R2)", async () => {
    const calls: string[] = [];
    ok(await run(createRunner({ stages: fakeStages(calls, { segment: { settingsKey: () => ({ a: 1, b: 2 }) } }), log: silentLogger })));
    calls.length = 0;
    ok(await run(createRunner({ stages: fakeStages(calls, { segment: { settingsKey: () => ({ b: 2, a: 1 }) } }), log: silentLogger })));
    expect(calls).toEqual([]);
  });

  it("reruns a stage whose version was bumped, and everything after it", async () => {
    const calls: string[] = [];
    ok(await run(createRunner({ stages: fakeStages(calls), log: silentLogger })));
    calls.length = 0;
    ok(await run(createRunner({ stages: fakeStages(calls, { highlights: { version: 2 } }), log: silentLogger })));
    expect(calls).toEqual(ALL_UNITS.slice(3));
  });

  it("reruns a stage whose output file was deleted (R3)", async () => {
    const calls: string[] = [];
    const runner = createRunner({ stages: fakeStages(calls), log: silentLogger });
    ok(await run(runner));
    await rm(join(paths.dir, "stages", "transcribe.out"));
    calls.length = 0;
    ok(await run(runner));
    expect(calls).toEqual(ALL_UNITS.slice(1));
  });

  it("stops at a stage that throws, writes no record for it, and resumes there next time (R5)", async () => {
    const calls: string[] = [];
    let llmDown = true;
    const highlights = {
      run: async (ctx: StageContext) => {
        if (llmDown) throw new Error("LLM is not reachable");
        return defaultRun("highlights")(ctx);
      },
    };
    const runner = createRunner({ stages: fakeStages(calls, { highlights }), log: silentLogger });

    const failed = await run(runner);
    expect(failed).toEqual({ ok: false, jobId: expect.any(String), stage: "highlights", message: "LLM is not reachable" });
    const manifest = await readManifest(paths, silentLogger);
    expect(Object.keys(manifest.stages)).toEqual(["ingest", "transcribe", "segment"]);

    llmDown = false;
    calls.length = 0;
    const resumed = ok(await run(runner));
    expect(calls).toEqual(ALL_UNITS.slice(3));
    expect(labels(resumed.skipped)).toEqual(["ingest", "transcribe", "segment"]);
  });

  it("reruns everything after a forced stage, even when the run crashed in between (R3)", async () => {
    const calls: string[] = [];
    let crash = false;
    const highlights = {
      run: async (ctx: StageContext) => {
        if (crash) throw new Error("crashed");
        return defaultRun("highlights")(ctx);
      },
    };
    const runner = createRunner({ stages: fakeStages(calls, { highlights }), log: silentLogger });
    ok(await run(runner));

    crash = true;
    calls.length = 0;
    expect(await run(runner, { force: ["segment"] })).toMatchObject({ ok: false, stage: "highlights" });
    expect(calls).toEqual(["segment", "highlights"]);

    // segment's new output may differ, so its old downstream results must not be reused
    crash = false;
    calls.length = 0;
    ok(await run(runner));
    expect(calls).toEqual(ALL_UNITS.slice(3));
  });

  it("`from` reruns that stage and everything after it (R4)", async () => {
    const calls: string[] = [];
    const runner = createRunner({ stages: fakeStages(calls), log: silentLogger });
    ok(await run(runner));
    calls.length = 0;
    ok(await run(runner, { from: "snap" }));
    expect(calls).toEqual(ALL_UNITS.slice(4));
  });

  it("`to: transcribe` runs ingest and transcribe only (R4)", async () => {
    const calls: string[] = [];
    const runner = createRunner({ stages: fakeStages(calls), log: silentLogger });
    ok(await run(runner, { to: "transcribe" }));
    expect(calls).toEqual(["ingest", "transcribe"]);
    const manifest = await readManifest(paths, silentLogger);
    expect(Object.keys(manifest.stages)).toEqual(["ingest", "transcribe"]);
  });

  it("`to` works even when that stage isn't registered yet (R4)", async () => {
    const calls: string[] = [];
    const runner = createRunner({ stages: fakeStages(calls, {}, ["ingest", "segment"]), log: silentLogger });
    ok(await run(runner, { to: "transcribe" }));
    expect(calls).toEqual(["ingest"]);
  });

  it("records outputs relative to the project folder, with forward slashes", async () => {
    const runner = createRunner({ stages: fakeStages([], {}, ["ingest"]), log: silentLogger });
    ok(await run(runner));
    const manifest = await readManifest(paths, silentLogger);
    expect(manifest.stages.ingest).toMatchObject({ version: 1, outputs: ["stages/ingest.out"] });
  });

  it("fails a stage that reports an output it didn't write (SPEC-010 R8)", async () => {
    const transcribe = { run: async () => ({ outputs: ["stages/transcript.json"] }) };
    const runner = createRunner({ stages: fakeStages([], { transcribe }, ["ingest", "transcribe"]), log: silentLogger });
    const result = await run(runner);
    expect(result).toMatchObject({ ok: false, stage: "transcribe", message: expect.stringContaining("transcript.json") });
    expect((await readManifest(paths, silentLogger)).stages.transcribe).toBeUndefined();
  });

  it("fails a stage that reports an output outside the project folder", async () => {
    const ingest = { run: async () => ({ outputs: [sourcePath] }) };
    const runner = createRunner({ stages: fakeStages([], { ingest }, ["ingest"]), log: silentLogger });
    expect(await run(runner)).toMatchObject({ ok: false, stage: "ingest", message: expect.stringContaining("outside") });
  });

  it("succeeds and runs nothing with no stages registered (M0)", async () => {
    const result = ok(await run(createRunner({ stages: [], log: silentLogger })));
    expect(result).toEqual({ ok: true, jobId: expect.any(String), ran: [], skipped: [] });
  });

  it("throws for a folder that isn't a project", async () => {
    const runner = createRunner({ stages: [], log: silentLogger });
    await expect(runner.run(root, { signal: new AbortController().signal })).rejects.toThrow(/Not a Clipper project/);
  });
});

describe("per-clip stages (R2, R10)", () => {
  it("`clipIds: [c02]` reruns per-clip stages for c02 only", async () => {
    const calls: string[] = [];
    const runner = createRunner({ stages: fakeStages(calls), log: silentLogger });
    ok(await run(runner));
    calls.length = 0;
    const result = ok(await run(runner, { force: ["reframe"], clipIds: ["c02"] }));
    expect(calls).toEqual(["reframe:c02", "captions:c02", "render:c02"]);
    expect(labels(result.skipped)).toEqual(PROJECT_STAGES);
  });

  it("reruns only the clip whose entry in clips.json changed", async () => {
    const calls: string[] = [];
    const runner = createRunner({ stages: fakeStages(calls), log: silentLogger });
    ok(await run(runner));
    await writeJsonAtomic(paths.clips, clipsFile({ c01: 0, c02: 105, c03: 200 }));
    calls.length = 0;
    ok(await run(runner));
    expect(calls).toEqual(["reframe:c02", "captions:c02", "render:c02"]);
  });

  it("reports the clip that failed and resumes from that clip's stage", async () => {
    const calls: string[] = [];
    let broken = true;
    const render = {
      run: async (ctx: StageContext, clipId?: string) => {
        if (broken && clipId === "c02") throw new Error("encoder failed");
        return defaultRun("render")(ctx, clipId);
      },
    };
    const runner = createRunner({ stages: fakeStages(calls, { render }), log: silentLogger });
    expect(await run(runner)).toMatchObject({ ok: false, stage: "render", clipId: "c02", message: "encoder failed" });

    broken = false;
    calls.length = 0;
    ok(await run(runner));
    expect(calls).toEqual(["render:c02", "reframe:c03", "captions:c03", "render:c03"]);
  });

  it("fails at the first per-clip stage when clips.json is missing", async () => {
    const calls: string[] = [];
    const runner = createRunner({ stages: fakeStages(calls, {}, ["ingest", "reframe", "render"]), log: silentLogger });
    expect(await run(runner)).toMatchObject({ ok: false, stage: "reframe", message: expect.stringContaining("clips.json") });
    expect(calls).toEqual(["ingest"]);
  });

  it("fails when clipIds names a clip that doesn't exist", async () => {
    const runner = createRunner({ stages: fakeStages([]), log: silentLogger });
    expect(await run(runner, { clipIds: ["c99"] })).toMatchObject({
      ok: false,
      stage: "reframe",
      message: expect.stringContaining("c99"),
    });
  });
});

describe("source checks (R11)", () => {
  it("refuses to run ingest when the source video is gone", async () => {
    const calls: string[] = [];
    await rm(sourcePath);
    const result = await run(createRunner({ stages: fakeStages(calls), log: silentLogger }));
    expect(result).toMatchObject({ ok: false, stage: "ingest", sourceMissing: true });
    expect(calls).toEqual([]);
  });

  it("skips cached stages after the source changed, runs stages that don't read it, refuses the rest", async () => {
    const calls: string[] = [];
    const runner = createRunner({ stages: fakeStages(calls), log: silentLogger });
    ok(await run(runner));
    await appendFile(sourcePath, " edited");

    calls.length = 0;
    ok(await run(runner));
    ok(await run(runner, { force: ["highlights"], to: "snap" }));
    expect(calls).toEqual(["highlights", "snap"]);

    calls.length = 0;
    const result = await run(runner, { force: ["render"], clipIds: ["c01"] });
    expect(result).toMatchObject({ ok: false, stage: "render", clipId: "c01", sourceMissing: true });
    expect(calls).toEqual(["reframe:c01", "captions:c01"]);
  });
});

describe("cancel (R6)", () => {
  it("aborts the running stage's signal, returns cancelled and removes .tmp files", async () => {
    const calls: string[] = [];
    const controller = new AbortController();
    let seen: AbortSignal | undefined;
    let markStarted = () => {};
    const started = new Promise<void>((resolve) => (markStarted = resolve));
    const transcribe = {
      run: async (ctx: StageContext) => {
        seen = ctx.signal;
        await writeFile(`${ctx.dir.transcript}.tmp`, "half a transcript");
        markStarted();
        await new Promise((_resolve, reject) => ctx.signal.addEventListener("abort", () => reject(ctx.signal.reason)));
        return { outputs: [] };
      },
    };
    const runner = createRunner({ stages: fakeStages(calls, { transcribe }), log: silentLogger });

    const running = runner.run(paths.dir, { signal: controller.signal });
    await started;
    controller.abort();
    expect(await running).toEqual({ ok: false, cancelled: true, jobId: expect.any(String) });
    expect(seen?.aborted).toBe(true);
    expect(await exists(`${paths.transcript}.tmp`)).toBe(false);
    expect(calls).toEqual(["ingest", "transcribe"]);
    const manifest = await readManifest(paths, silentLogger);
    expect(Object.keys(manifest.stages)).toEqual(["ingest"]);
  });

  it("keeps a stage that finished as the abort landed, and starts no new one", async () => {
    const calls: string[] = [];
    const controller = new AbortController();
    const ingest = {
      run: async (ctx: StageContext) => {
        const done = await defaultRun("ingest")(ctx);
        controller.abort();
        return done;
      },
    };
    const runner = createRunner({ stages: fakeStages(calls, { ingest }), log: silentLogger });
    expect(await runner.run(paths.dir, { signal: controller.signal })).toMatchObject({ ok: false, cancelled: true });
    expect(calls).toEqual(["ingest"]);
    expect((await readManifest(paths, silentLogger)).stages.ingest).toBeDefined();
  });
});

describe("progress (R7, R8)", () => {
  it("reports monotonic overall progress from 0 to 1", async () => {
    let clock = 0;
    const now = () => (clock += 300); // every update clears the throttle
    const highlights = {
      run: async (ctx: StageContext) => {
        ctx.progress(0.8);
        ctx.progress(0.3); // a stage going backwards must not move overall back
        ctx.progress(Number.NaN);
        return defaultRun("highlights")(ctx);
      },
    };
    const updates: { overall: number; clipId?: string }[] = [];
    const runner = createRunner({ stages: fakeStages([], { highlights }), log: silentLogger, now });
    ok(await run(runner, { onProgress: (update) => updates.push(update) }));

    const overall = updates.map((update) => update.overall);
    expect(overall[0]).toBe(0);
    expect(overall.at(-1)).toBe(1);
    expect(overall).toEqual([...overall].sort((a, b) => a - b));
    expect(updates.some((update) => update.clipId === "c03")).toBe(true);
  });

  it("counts skipped stages as complete and ends at 1 with `to`", async () => {
    const runner = createRunner({ stages: fakeStages([]), log: silentLogger });
    ok(await run(runner, { to: "transcribe" }));
    const updates: number[] = [];
    ok(await run(runner, { to: "transcribe", onProgress: (update) => updates.push(update.overall) }));
    expect(updates[0]).toBe(0);
    expect(updates.at(-1)).toBe(1);
  });

  it("sends at most 4 updates per second, plus the final one", async () => {
    let clock = 0;
    const transcribe = {
      run: async (ctx: StageContext) => {
        for (let step = 1; step <= 200; step += 1) {
          clock += 5;
          ctx.progress(step / 200);
        }
        return defaultRun("transcribe")(ctx);
      },
    };
    const times: number[] = [];
    const updates: number[] = [];
    const runner = createRunner({ stages: fakeStages([], { transcribe }, ["ingest", "transcribe"]), log: silentLogger, now: () => clock });
    ok(
      await run(runner, {
        onProgress: (update) => {
          times.push(clock);
          updates.push(update.overall);
        },
      }),
    );

    const gaps = times.slice(1, -1).map((time, index) => time - times[index]!);
    expect(gaps.every((gap) => gap >= 250)).toBe(true);
    expect(times.length).toBeLessThanOrEqual(6); // 1 s of stage work: the first, ≤4 throttled, the final
    expect(updates.at(-1)).toBe(1);
  });
});

describe("job log and temp files (R9, R12)", () => {
  it("writes logs/job-<jobId>.log with info lines but no debug lines", async () => {
    const transcribe = {
      run: async (ctx: StageContext) => {
        ctx.log.debug("transcript: আমার সোনার বাংলা");
        ctx.log.info("model loaded");
        return defaultRun("transcribe")(ctx);
      },
    };
    const base = { ...silentLogger, debug: vi.fn() };
    const runner = createRunner({ stages: fakeStages([], { transcribe }, ["ingest", "transcribe"]), log: base });
    const result = ok(await run(runner, { jobId: "test-job" }));
    expect(result.jobId).toBe("test-job");

    const text = await readFile(paths.jobLog("test-job"), "utf8");
    expect(text).toContain("model loaded");
    expect(text).toContain("transcribe");
    expect(text).not.toContain("আমার");
    expect(base.debug).toHaveBeenCalledWith("transcript: আমার সোনার বাংলা", undefined);
  });

  it("keeps the project folder and source path out of the job log", async () => {
    const ingest = {
      run: async () => {
        throw new Error(`ENOENT: no such file or directory, open '${sourcePath}' (copy in ${paths.dir})`);
      },
    };
    const runner = createRunner({ stages: fakeStages([], { ingest }, ["ingest"]), log: silentLogger });
    expect(await run(runner, { jobId: "paths" })).toMatchObject({ ok: false, stage: "ingest" });
    const text = await readFile(paths.jobLog("paths"), "utf8");
    expect(text).toContain("ENOENT");
    expect(text).not.toContain(sourcePath);
    expect(text).not.toContain(paths.dir);
  });

  it("removes leftover .tmp files when a run starts", async () => {
    const leftover = join(paths.dir, "stages", "segments.json.tmp");
    await writeFile(leftover, "{");
    ok(await run(createRunner({ stages: [], log: silentLogger })));
    expect(await exists(leftover)).toBe(false);
  });
});
