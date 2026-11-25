import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Manifest, StageRecord } from "@shared/schemas";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { silentLogger } from "../log";
import { emptyManifest, readManifest, recordStage, writeManifest } from "./manifest";
import { projectPaths } from "./paths";
import type { ProjectPaths } from "./paths";

let paths: ProjectPaths;

beforeEach(async () => {
  paths = projectPaths(await mkdtemp(join(tmpdir(), "clipper-manifest-")));
});

afterEach(async () => {
  await rm(paths.dir, { recursive: true, force: true });
});

function record(outputs: string[]): StageRecord {
  return { version: 1, inputHash: "abc123", outputs, completedAt: "2026-11-25T10:00:00.000Z", durationMs: 1234 };
}

describe("manifest", () => {
  it("reads a missing manifest as empty, without a warning", async () => {
    const log = { ...silentLogger, warn: vi.fn() };
    expect(await readManifest(paths, log)).toEqual(emptyManifest());
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("round-trips through its schema", async () => {
    const manifest: Manifest = {
      schemaVersion: 1,
      stages: { ingest: record(["media/probe.json"]), transcribe: record(["stages/transcript.json"]) },
      clips: { c01: { captions: record(["stages/captions/c01.ass"]) } },
    };
    await writeManifest(paths, manifest);
    expect(await readManifest(paths, silentLogger)).toEqual(manifest);
  });

  it.each([
    ["broken JSON", "{"],
    ["an unknown stage", JSON.stringify({ schemaVersion: 1, stages: { upload: record([]) }, clips: {} })],
    ["a newer schemaVersion", JSON.stringify({ schemaVersion: 2, stages: {}, clips: {} })],
  ])("treats a manifest with %s as empty and warns (R5)", async (_label, content) => {
    await writeFile(paths.manifest, content);
    const log = { ...silentLogger, warn: vi.fn() };
    expect(await readManifest(paths, log)).toEqual(emptyManifest());
    expect(log.warn).toHaveBeenCalledOnce();
  });
});

describe("recordStage", () => {
  it("records a stage once its outputs exist (R8)", async () => {
    await mkdir(join(paths.dir, "media"));
    await writeFile(paths.probe, "{}");
    const manifest = await recordStage(paths, { stage: "ingest", record: record(["media/probe.json"]) }, silentLogger);
    expect(manifest.stages.ingest).toEqual(record(["media/probe.json"]));
    expect(await readManifest(paths, silentLogger)).toEqual(manifest);
  });

  it("refuses to record a stage whose outputs are missing, leaving the manifest as it was (R8)", async () => {
    await writeManifest(paths, emptyManifest());
    const before = await readFile(paths.manifest, "utf8");
    await expect(
      recordStage(paths, { stage: "ingest", record: record(["media/probe.json"]) }, silentLogger),
    ).rejects.toThrow(/media\/probe\.json/);
    expect(await readFile(paths.manifest, "utf8")).toBe(before);
  });

  it("refuses absolute output paths", async () => {
    await writeFile(join(paths.dir, "x.json"), "{}");
    await expect(
      recordStage(paths, { stage: "segment", record: record([join(paths.dir, "x.json")]) }, silentLogger),
    ).rejects.toThrow(/relative/);
  });

  it("records per-clip stages under clips[clipId] without touching other clips or stages (R7)", async () => {
    await mkdir(join(paths.dir, "stages", "captions"), { recursive: true });
    await writeFile(paths.captions("c01"), "");
    await writeFile(paths.captions("c02"), "");
    await recordStage(
      paths,
      { stage: "captions", clipId: "c01", record: record(["stages/captions/c01.ass"]) },
      silentLogger,
    );
    const manifest = await recordStage(
      paths,
      { stage: "captions", clipId: "c02", record: record(["stages/captions/c02.ass"]) },
      silentLogger,
    );
    expect(manifest.stages).toEqual({});
    expect(Object.keys(manifest.clips).sort()).toEqual(["c01", "c02"]);
    expect(manifest.clips.c01?.captions?.outputs).toEqual(["stages/captions/c01.ass"]);
  });
});
