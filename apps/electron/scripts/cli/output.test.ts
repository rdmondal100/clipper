import { describe, expect, it } from "vitest";
import { createReporter, formatProgress } from "./output";

function capture(options: { json: boolean; debug?: boolean }) {
  const out: string[] = [];
  const err: string[] = [];
  const reporter = createReporter({
    json: options.json,
    debug: options.debug ?? false,
    write: { out: (line) => out.push(line), err: (line) => err.push(line) },
  });
  return { reporter, out, err };
}

describe("formatProgress (R5)", () => {
  it("prints the stage, whole percent and note", () => {
    expect(formatProgress({ stage: "transcribe", stageProgress: 0.429, overall: 0.2, note: "chunk 3/7" })).toBe("[transcribe] 42% chunk 3/7");
    expect(formatProgress({ stage: "render", clipId: "c01", stageProgress: 1, overall: 1 })).toBe("[render c01] 100%");
  });
});

describe("text reporter", () => {
  it("prints progress lines once per change of whole percent", () => {
    const { reporter, out } = capture({ json: false });
    reporter.progress({ stage: "ingest", stageProgress: 0.501, overall: 0.1 });
    reporter.progress({ stage: "ingest", stageProgress: 0.509, overall: 0.1 });
    reporter.progress({ stage: "ingest", stageProgress: 0.51, overall: 0.1 });
    expect(out).toEqual(["[ingest] 50%", "[ingest] 51%"]);
  });

  it("sends info to stdout, warnings and errors to stderr, debug only when asked", () => {
    const quiet = capture({ json: false });
    quiet.reporter.log.info("Running ingest");
    quiet.reporter.log.warn("probe.json is invalid", { issues: 1 });
    quiet.reporter.log.error("ingest failed: boom");
    quiet.reporter.log.debug("transcript text");
    expect(quiet.out).toEqual(["Running ingest"]);
    expect(quiet.err).toEqual(['warning: probe.json is invalid {"issues":1}', "error: ingest failed: boom"]);

    const loud = capture({ json: false, debug: true });
    loud.reporter.log.debug("stack", new Error("why"));
    expect(loud.err).toEqual(["debug: stack why"]);
  });

  it("prints the project folder and the exported files on success (R6)", () => {
    const { reporter, out } = capture({ json: false });
    reporter.result({ exitCode: 0, projectId: "p", projectDir: "D:\\p", exports: ["D:\\p\\exports\\c01_tiktok.mp4"] });
    expect(out.join("\n")).toContain("Project folder: D:\\p");
    expect(out.join("\n")).toContain("  D:\\p\\exports\\c01_tiktok.mp4");

    const empty = capture({ json: false });
    empty.reporter.result({ exitCode: 0, projectId: "p", projectDir: "D:\\p", exports: [] });
    expect(empty.out.join("\n")).toContain("No exported files yet.");
  });

  it("tells how to resume after a failure or cancel", () => {
    const failed = capture({ json: false });
    failed.reporter.result({ exitCode: 1, projectId: "p", stage: "ingest", message: "boom", sourceMissing: true, resume: "npm run clip -- --project p" });
    expect(failed.err).toEqual([
      "The source video was moved or changed. Put it back, or start a new project.",
      "To resume after fixing it: npm run clip -- --project p",
    ]);

    const cancelled = capture({ json: false });
    cancelled.reporter.result({ exitCode: 130, projectId: "p", resume: "npm run clip -- --project p" });
    expect(cancelled.err).toEqual(["Cancelled. To resume: npm run clip -- --project p"]);
  });
});

describe("JSON reporter (R5 --json)", () => {
  it("writes one parseable object per line, everything on stdout", () => {
    const { reporter, out, err } = capture({ json: true });
    reporter.project({ id: "p", dir: "D:\\p", created: true });
    reporter.log.info("Running ingest");
    reporter.log.warn("careful", new Error("why"));
    reporter.log.debug("hidden");
    reporter.progress({ stage: "ingest", stageProgress: 0.5, overall: 0.25, note: "probe" });
    reporter.progress({ stage: "ingest", stageProgress: 0.5, overall: 0.25, note: "probe" });
    reporter.result({ exitCode: 0, projectId: "p", projectDir: "D:\\p", exports: [] });

    expect(err).toEqual([]);
    expect(out.map((line) => JSON.parse(line))).toEqual([
      { type: "project", id: "p", dir: "D:\\p", created: true },
      { type: "log", level: "info", message: "Running ingest" },
      { type: "log", level: "warn", message: "careful", data: "why" },
      { type: "progress", stage: "ingest", stageProgress: 0.5, overall: 0.25, note: "probe" },
      { type: "progress", stage: "ingest", stageProgress: 0.5, overall: 0.25, note: "probe" },
      { type: "result", exitCode: 0, projectId: "p", projectDir: "D:\\p", exports: [] },
    ]);
  });
});
