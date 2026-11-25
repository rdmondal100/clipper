import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { silentLogger } from "../log";
import { nodeAtomicFs, readJsonFile, removeTmpFiles, writeJsonAtomic } from "./files";
import type { AtomicFs } from "./files";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "clipper-files-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function errorWithCode(code: string) {
  return Object.assign(new Error(`${code}: simulated`), { code });
}

describe("writeJsonAtomic", () => {
  it("writes readable JSON and creates missing folders", async () => {
    const target = join(dir, "stages", "faces", "c01.json");
    await writeJsonAtomic(target, { schemaVersion: 1, text: "আমি हिन्दी" });
    expect(JSON.parse(await readFile(target, "utf8"))).toEqual({ schemaVersion: 1, text: "আমি हिन्दी" });
    expect(existsSync(`${target}.tmp`)).toBe(false);
  });

  it("never leaves a partly written target when the process dies between tmp write and rename", async () => {
    const target = join(dir, "manifest.json");
    await writeJsonAtomic(target, { version: 1 });
    const before = await readFile(target, "utf8");

    // the process "dies" at the rename: it never happens
    let renameReached!: () => void;
    const reached = new Promise<void>((resolve) => (renameReached = resolve));
    const dyingFs: AtomicFs = {
      ...nodeAtomicFs,
      rename: () => {
        renameReached();
        return new Promise<void>(() => {});
      },
    };
    void writeJsonAtomic(target, { version: 2, big: "x".repeat(200_000) }, { fs: dyingFs });
    await reached;

    expect(await readFile(target, "utf8")).toBe(before);
    expect(JSON.parse(await readFile(`${target}.tmp`, "utf8"))).toMatchObject({ version: 2 });

    // R6: the next job clears the leftover
    expect(await removeTmpFiles(dir)).toBe(1);
    expect(existsSync(`${target}.tmp`)).toBe(false);
    expect(await readFile(target, "utf8")).toBe(before);
  });

  it("never creates a partial target on a first write that dies before the rename", async () => {
    const target = join(dir, "project.json");
    let renameReached!: () => void;
    const reached = new Promise<void>((resolve) => (renameReached = resolve));
    const dyingFs: AtomicFs = {
      ...nodeAtomicFs,
      rename: () => {
        renameReached();
        return new Promise<void>(() => {});
      },
    };
    void writeJsonAtomic(target, { version: 1 }, { fs: dyingFs });
    await reached;
    expect(existsSync(target)).toBe(false);
  });

  it("keeps the old target when the tmp write fails halfway", async () => {
    const target = join(dir, "manifest.json");
    await writeJsonAtomic(target, { version: 1 });
    const before = await readFile(target, "utf8");

    const failingFs: AtomicFs = {
      ...nodeAtomicFs,
      writeFile: async (path, data, options) => {
        await nodeAtomicFs.writeFile(path, data.slice(0, data.length / 2), options);
        throw errorWithCode("ENOSPC");
      },
    };
    await expect(writeJsonAtomic(target, { version: 2, big: "x".repeat(1000) }, { fs: failingFs })).rejects.toThrow(
      "ENOSPC",
    );
    expect(await readFile(target, "utf8")).toBe(before);
    expect(existsSync(`${target}.tmp`)).toBe(false);
  });

  it("retries a rename that Windows briefly refuses (EPERM)", async () => {
    const target = join(dir, "manifest.json");
    await writeJsonAtomic(target, { version: 1 });
    let attempts = 0;
    const flakyFs: AtomicFs = {
      ...nodeAtomicFs,
      rename: async (from, to) => {
        attempts += 1;
        if (attempts <= 2) throw errorWithCode("EPERM");
        await nodeAtomicFs.rename(from, to);
      },
    };
    await writeJsonAtomic(target, { version: 2 }, { fs: flakyFs });
    expect(attempts).toBe(3);
    expect(JSON.parse(await readFile(target, "utf8"))).toEqual({ version: 2 });
  });
});

describe("readJsonFile", () => {
  const Schema = z.object({ schemaVersion: z.literal(1), name: z.string() });

  it("returns undefined without a warning when the file is missing", async () => {
    const log = { ...silentLogger, warn: vi.fn() };
    expect(await readJsonFile(join(dir, "nope.json"), Schema, log)).toBeUndefined();
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("parses a valid file, even one saved with a BOM", async () => {
    const path = join(dir, "a.json");
    await writeFile(path, `﻿${JSON.stringify({ schemaVersion: 1, name: "বাংলা" })}`, "utf8");
    expect(await readJsonFile(path, Schema, silentLogger)).toEqual({ schemaVersion: 1, name: "বাংলা" });
  });

  it.each([
    ["broken JSON", "{ not json"],
    ["wrong shape", JSON.stringify({ schemaVersion: 2, name: "x" })],
  ])("treats %s as missing and warns (R5)", async (_label, content) => {
    const path = join(dir, "bad.json");
    await writeFile(path, content, "utf8");
    const log = { ...silentLogger, warn: vi.fn() };
    expect(await readJsonFile(path, Schema, log)).toBeUndefined();
    expect(log.warn).toHaveBeenCalledOnce();
  });
});

describe("removeTmpFiles", () => {
  it("removes .tmp files in nested folders and nothing else", async () => {
    await mkdir(join(dir, "stages", "faces"), { recursive: true });
    await writeFile(join(dir, "manifest.json.tmp"), "x");
    await writeFile(join(dir, "stages", "faces", "c01.json.tmp"), "x");
    await writeFile(join(dir, "stages", "faces", "c01.json"), "{}");
    expect(await removeTmpFiles(dir)).toBe(2);
    expect(existsSync(join(dir, "stages", "faces", "c01.json"))).toBe(true);
    expect(existsSync(join(dir, "manifest.json.tmp"))).toBe(false);
  });
});
