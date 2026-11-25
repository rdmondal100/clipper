import { appendFile, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Project } from "@shared/schemas";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createProject } from "./create";
import type { ProjectPaths } from "./paths";
import { checkSource } from "./source";

let tmp: string;
let sourcePath: string;
let project: Project;
let paths: ProjectPaths;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "clipper-source-"));
  sourcePath = join(tmp, "বাংলা ভিডিও.mp4");
  await writeFile(sourcePath, "original bytes");
  ({ project, paths } = await createProject({
    root: join(tmp, "Projects"),
    sourcePath,
    language: "bn",
    settings: { clipCount: 10, minSec: 20, maxSec: 60, presets: ["youtube-shorts"] },
  }));
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe("checkSource (R4)", () => {
  it("is ok while the source is unchanged", async () => {
    expect(await checkSource(paths, project)).toEqual({ ok: true });
  });

  it("reports sourceMissing when the file is gone", async () => {
    await rm(sourcePath);
    expect(await checkSource(paths, project)).toEqual({ ok: false, status: "sourceMissing", reason: "missing" });
  });

  it("reports sourceMissing when the size changes", async () => {
    await appendFile(sourcePath, " and more");
    expect(await checkSource(paths, project)).toEqual({ ok: false, status: "sourceMissing", reason: "changed" });
  });

  it("reports sourceMissing when only the mtime changes", async () => {
    const later = new Date(project.source.mtimeMs + 60_000);
    await utimes(sourcePath, later, later);
    expect(await checkSource(paths, project)).toEqual({ ok: false, status: "sourceMissing", reason: "changed" });
  });
});
