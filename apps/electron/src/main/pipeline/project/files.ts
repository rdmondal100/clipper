import * as fsp from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { z } from "zod";
import type { Logger } from "../log";

// the fs calls writeJsonAtomic makes; tests swap one out to simulate a crash between steps
type AtomicFs = {
  mkdir: (path: string, options: { recursive: true }) => Promise<unknown>;
  writeFile: (path: string, data: string, options: { encoding: "utf8"; flush: boolean }) => Promise<void>;
  rename: (from: string, to: string) => Promise<void>;
  rm: (path: string, options: { force: true }) => Promise<void>;
};

const nodeAtomicFs: AtomicFs = { mkdir: fsp.mkdir, writeFile: fsp.writeFile, rename: fsp.rename, rm: fsp.rm };

// antivirus or the search indexer can hold a file for a moment, so Windows refuses the rename
const RENAME_RETRY_MS = [50, 100, 200, 400, 800];
const RENAME_RETRY_CODES = new Set(["EPERM", "EACCES", "EBUSY"]);

function errorCode(error: unknown) {
  return error instanceof Error && "code" in error ? String(error.code) : "";
}

async function renameWithRetry(fs: AtomicFs, from: string, to: string) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await fs.rename(from, to);
      return;
    } catch (error) {
      const delay = RENAME_RETRY_MS[attempt];
      if (delay === undefined || !RENAME_RETRY_CODES.has(errorCode(error))) throw error;
      await sleep(delay);
    }
  }
}

// SPEC-010 R6: readers see the old file or the new one, never half of one
async function writeJsonAtomic(path: string, data: object, deps: { fs?: AtomicFs } = {}) {
  const fs = deps.fs ?? nodeAtomicFs;
  const tmp = `${path}.tmp`;
  await fs.mkdir(dirname(path), { recursive: true });
  try {
    // flush so a power cut can't leave the renamed file empty
    await fs.writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, { encoding: "utf8", flush: true });
    await renameWithRetry(fs, tmp, path);
  } catch (error) {
    await fs.rm(tmp, { force: true }).catch(() => {});
    throw error;
  }
}

// SPEC-010 R5: a missing or invalid file reads as undefined, so the stage that owns it reruns
async function readJsonFile<T>(path: string, schema: z.ZodType<T>, log: Logger): Promise<T | undefined> {
  let text: string;
  try {
    text = await fsp.readFile(path, "utf8");
  } catch (error) {
    if (errorCode(error) === "ENOENT") return undefined;
    throw error;
  }

  let json: unknown;
  try {
    json = JSON.parse(text.replace(/^﻿/, "")); // Notepad saves UTF-8 with a BOM
  } catch {
    log.warn(`Ignoring ${basename(path)}: not valid JSON`);
    return undefined;
  }

  const result = schema.safeParse(json);
  if (!result.success) {
    log.warn(`Ignoring ${basename(path)}: it doesn't match its schema`, z.prettifyError(result.error));
    return undefined;
  }
  return result.data;
}

// SPEC-010 R6: a crash between write and rename leaves <file>.tmp behind; each new job clears them
async function removeTmpFiles(dir: string) {
  const entries = await fsp.readdir(dir, { recursive: true, withFileTypes: true });
  const leftovers = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".tmp"));
  await Promise.all(leftovers.map((entry) => fsp.rm(join(entry.parentPath, entry.name), { force: true })));
  return leftovers.length;
}

export { errorCode, nodeAtomicFs, readJsonFile, removeTmpFiles, writeJsonAtomic };
export type { AtomicFs };
