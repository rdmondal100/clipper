import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// ADR-0002: these folders run in the worker, the CLI and tests, so they must never import Electron
const GUARDED = ["pipeline", "ai", "media"].map((folder) => join(import.meta.dirname, "..", folder));
const ELECTRON_IMPORT = /(?:from\s+["']electron(?:\/[^"']*)?["'])|(?:require\(\s*["']electron["']\s*\))|(?:import\(\s*["']electron["']\s*\))/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|mts|js|mjs)$/.test(name) && !name.endsWith(".test.ts") ? [path] : [];
  });
}

describe("ADR-0002 guard", () => {
  it("pipeline, ai and media never import electron", () => {
    const offenders = GUARDED.flatMap(sourceFiles).filter((file) => ELECTRON_IMPORT.test(readFileSync(file, "utf8")));
    const names = offenders.map((file) => relative(join(import.meta.dirname, ".."), file));
    expect(names, `These files import electron: ${names.join(", ")}`).toEqual([]);
  });
});
