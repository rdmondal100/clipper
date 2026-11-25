import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, parseClipArgs } from "./args";
import type { ClipArgs } from "./args";

function ok(argv: string[]): ClipArgs {
  const parsed = parseClipArgs(argv);
  if (parsed.kind !== "run") throw new Error(`expected run, got ${JSON.stringify(parsed)}`);
  return parsed.args;
}

function error(argv: string[]) {
  const parsed = parseClipArgs(argv);
  if (parsed.kind !== "error") throw new Error(`expected error, got ${JSON.stringify(parsed)}`);
  return parsed.message;
}

describe("parseClipArgs", () => {
  it("creates a new project with the default settings", () => {
    expect(ok(["talk.mp4", "--lang", "en"])).toEqual({
      target: { kind: "new", video: "talk.mp4", language: "en", settings: DEFAULT_SETTINGS },
      projectsDir: undefined,
      to: undefined,
      force: [],
      transcriber: "whisper-local",
      pending: [],
      json: false,
    });
  });

  it.each(["bn", "en", "hi"] as const)("accepts --lang %s and a video name in any script", (lang) => {
    const video = { bn: "আলোচনা.mp4", en: "talk.mp4", hi: "चर्चा.mp4" }[lang];
    expect(ok([video, "--lang", lang]).target).toMatchObject({ kind: "new", video, language: lang });
  });

  it("needs --lang for a new project and lists the three languages", () => {
    expect(error(["talk.mp4"])).toMatch(/--lang is required: one of bn, en, hi/);
  });

  it("rejects an unknown language and lists the three languages", () => {
    expect(error(["talk.mp4", "--lang", "fr"])).toMatch(/Unknown language "fr"\. Use one of bn, en, hi/);
  });

  it("reuses a project without --lang, and keeps --lang to check it", () => {
    expect(ok(["--project", "20261125-101500-abc123"]).target).toEqual({
      kind: "existing",
      projectId: "20261125-101500-abc123",
      language: undefined,
    });
    expect(ok(["--project", "20261125-101500-abc123", "--lang", "bn"]).target).toMatchObject({ language: "bn" });
  });

  it("needs exactly one of a video or --project", () => {
    expect(error(["--lang", "en"])).toMatch(/Give a video file or --project/);
    expect(error(["talk.mp4", "--project", "x", "--lang", "en"])).toMatch(/not both/);
    expect(error(["my", "talk.mp4", "--lang", "en"])).toMatch(/Give one video, got 2/);
  });

  it("refuses settings flags on an existing project (they are fixed at creation)", () => {
    expect(error(["--project", "x", "--clips", "5", "--max", "40"])).toMatch(/--clips, --max only apply when creating a project/);
  });

  it("reads the project settings", () => {
    const args = ok(["talk.mp4", "--lang", "hi", "--clips", "5", "--min", "15.5", "--max", "45", "--preset", "tiktok, youtube-shorts,tiktok"]);
    expect(args.target).toMatchObject({
      settings: { clipCount: 5, minSec: 15.5, maxSec: 45, presets: ["tiktok", "youtube-shorts"] },
    });
  });

  it.each([["0"], ["31"], ["2.5"], ["five"]])("rejects --clips %s", (value) => {
    expect(error(["talk.mp4", "--lang", "en", "--clips", value])).toMatch(/--clips must be a whole number from 1 to 30/);
  });

  it("rejects bad durations", () => {
    expect(error(["talk.mp4", "--lang", "en", "--min", "0"])).toMatch(/--min must be a number of seconds above 0/);
    expect(error(["talk.mp4", "--lang", "en", "--max", "-5"])).toMatch(/--max/);
    expect(error(["talk.mp4", "--lang", "en", "--min", "60", "--max", "30"])).toMatch(/--min \(60\) must be shorter than --max \(30\)/);
    expect(error(["talk.mp4", "--lang", "en", "--min", "70"])).toMatch(/--min \(70\) must be shorter than --max \(60\)/);
  });

  it("rejects an unknown preset and lists the valid ones", () => {
    expect(error(["talk.mp4", "--lang", "en", "--preset", "snapchat"])).toMatch(/Unknown --preset value "snapchat"\. Use: youtube-shorts, facebook-reels/);
    expect(error(["talk.mp4", "--lang", "en", "--preset", ","])).toMatch(/--preset needs at least one value/);
  });

  it("reads --to and --force as stage names", () => {
    const args = ok(["talk.mp4", "--lang", "en", "--to", "transcribe", "--force", "ingest,transcribe"]);
    expect(args.to).toBe("transcribe");
    expect(args.force).toEqual(["ingest", "transcribe"]);
    expect(error(["talk.mp4", "--lang", "en", "--to", "upload"])).toMatch(/Unknown --to value "upload"\. Use one of: ingest, transcribe/);
    expect(error(["talk.mp4", "--lang", "en", "--to", "ingest,render"])).toMatch(/Unknown --to value/);
    expect(error(["talk.mp4", "--lang", "en", "--force", "ingest,upload"])).toMatch(/Unknown --force value "upload"/);
  });

  it("checks --transcriber", () => {
    expect(ok(["talk.mp4", "--lang", "en", "--transcriber", "openai-compatible-transcription"]).transcriber).toBe("openai-compatible-transcription");
    expect(error(["talk.mp4", "--lang", "en", "--transcriber", "whisper"])).toMatch(/Unknown --transcriber value "whisper"/);
  });

  it("collects M1 options that nothing uses yet, so the CLI can say so", () => {
    const args = ok(["talk.mp4", "--lang", "bn", "--llm", "ollama:some-model", "--context", "8192", "--replay-llm", "fixtures/recorded/llm"]);
    expect(args.pending).toEqual(["--llm", "--context", "--replay-llm"]);
  });

  it("rejects unknown options and missing values", () => {
    expect(error(["talk.mp4", "--lang", "en", "--fast"])).toMatch(/--fast/);
    expect(error(["talk.mp4", "--lang"])).toMatch(/--lang/);
  });

  it("returns help for --help and -h, before checking anything else", () => {
    expect(parseClipArgs(["--help"])).toEqual({ kind: "help" });
    expect(parseClipArgs(["-h", "--lang", "fr"])).toEqual({ kind: "help" });
  });

  it("reads --json and --projects-dir", () => {
    const args = ok(["talk.mp4", "--lang", "en", "--json", "--projects-dir", "D:/clips"]);
    expect(args.json).toBe(true);
    expect(args.projectsDir).toBe("D:/clips");
  });
});
