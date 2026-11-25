import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { normalizeText } from "@shared/languages";
import type { LanguageCode } from "@shared/languages";
import { ManifestSchema, ProjectSchema } from "@shared/schemas";
import type { Project } from "@shared/schemas";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { silentLogger } from "../log";
import { createProject, createProjectId, readProject } from "./create";
import { checkSource, sourceFilePath } from "./source";

const ID_PATTERN = /^\d{8}-\d{6}-[a-z0-9]{6}$/;
const SETTINGS: Project["settings"] = { clipCount: 10, minSec: 20, maxSec: 60, presets: ["youtube-shorts"] };

// U+09DF (য়) and U+0958 (क़) are composition exclusions: NFC turns them into two code points,
// so a path normalized to NFC would no longer name the file on NTFS
const SOURCES: Record<LanguageCode, { folder: string; file: string }> = {
  bn: { folder: "বাংলা ভিডিও", file: "আমার য়াত্রা — হিন্দি तुलना.mp4" },
  en: { folder: "English videos", file: "My first talk.mp4" },
  hi: { folder: "हिन्दी फ़ोल्डर", file: "मेरा क़िला वीडियो — বাংলা.mp4" },
};

let tmp: string;
let root: string;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "clipper-create-"));
  root = join(tmp, "Projects");
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

async function makeSource(folder: string, file: string, content = "fake video bytes") {
  await mkdir(join(tmp, folder), { recursive: true });
  const path = join(tmp, folder, file);
  await writeFile(path, content);
  return path;
}

async function allNames(dir: string) {
  return (await readdir(dir, { recursive: true })).map((name) => name.replaceAll("\\", "/")).sort();
}

describe("createProjectId", () => {
  it("is local date-time plus six [a-z0-9] characters", () => {
    const now = new Date(2026, 10, 25, 9, 5, 7);
    expect(createProjectId(now, () => 0)).toBe("20261125-090507-aaaaaa");
    expect(createProjectId(now, (max) => max - 1)).toBe("20261125-090507-999999");
    expect(createProjectId(now)).toMatch(ID_PATTERN);
  });
});

describe("createProject", () => {
  it("creates the folder layout, a valid project.json and an empty manifest", async () => {
    const sourcePath = await makeSource("in", "talk.mp4");
    const { project, paths } = await createProject({ root, sourcePath, language: "en", settings: SETTINGS });

    expect(project.id).toMatch(ID_PATTERN);
    expect(paths.dir).toBe(join(root, project.id));
    expect(await allNames(paths.dir)).toEqual(["exports", "logs", "manifest.json", "media", "project.json", "stages"]);
    expect(ProjectSchema.parse(JSON.parse(await readFile(paths.project, "utf8")))).toEqual(project);
    expect(ManifestSchema.parse(JSON.parse(await readFile(paths.manifest, "utf8")))).toEqual({
      schemaVersion: 1,
      stages: {},
      clips: {},
    });

    const info = await stat(sourcePath);
    expect(project.source).toEqual({ path: sourcePath, sizeBytes: info.size, mtimeMs: info.mtimeMs, copied: false });
    expect(project.name).toBe("talk");
    expect(project.language).toBe("en");
    expect(project.settings).toEqual(SETTINGS);
    expect(await readProject(paths.dir, silentLogger)).toEqual(project);
  });

  it.each(Object.entries(SOURCES) as Array<[LanguageCode, (typeof SOURCES)[LanguageCode]]>)(
    "works end to end with a %s source path in its own script",
    async (language, { folder, file }) => {
      const sourcePath = await makeSource(folder, file);
      const { project, paths } = await createProject({ root, sourcePath, language, settings: SETTINGS });

      // the path is kept exactly as given, so it still opens; the display name is NFC
      expect(project.source.path).toBe(resolve(sourcePath));
      expect(existsSync(project.source.path)).toBe(true);
      const rawName = file.replace(/\.mp4$/, "");
      expect(project.name).toBe(normalizeText(rawName));
      if (language !== "en") expect(project.name).not.toBe(rawName); // the fixture really needs care
      expect(project.language).toBe(language);
      expect(await checkSource(paths, project)).toEqual({ ok: true });

      // R2: only the root and the source may be non-ASCII; the project's own names are ASCII
      for (const name of [basename(paths.dir), ...(await allNames(paths.dir))]) expect(name).toMatch(/^[\x20-\x7e]+$/);
    },
  );

  it("copies the source into media/ when asked and leaves the original untouched (R3)", async () => {
    const sourcePath = await makeSource(SOURCES.bn.folder, "ভিডিও.MP4", "copied bytes");
    const before = await stat(sourcePath);
    const input = { root, sourcePath, language: "bn", settings: SETTINGS, copySource: true } as const;
    const { project, paths } = await createProject(input);

    expect(project.source.copied).toBe(true);
    expect(project.source.path).toBe("media/source.mp4");
    expect(sourceFilePath(paths, project)).toBe(join(paths.dir, "media", "source.mp4"));
    expect(await readFile(sourceFilePath(paths, project), "utf8")).toBe("copied bytes");
    expect(project.source.sizeBytes).toBe(before.size);
    expect(await checkSource(paths, project)).toEqual({ ok: true });

    const after = await stat(sourcePath);
    expect([after.size, after.mtimeMs]).toEqual([before.size, before.mtimeMs]);
  });

  it("uses the name it is given, NFC-normalized", async () => {
    const sourcePath = await makeSource("in", "a.mp4");
    const { project } = await createProject({ root, sourcePath, language: "hi", settings: SETTINGS, name: "  क़िला  " });
    expect(project.name).toBe("क़िला".normalize("NFC"));
  });

  it("fails without leaving a project folder when the source is missing", async () => {
    await expect(
      createProject({ root, sourcePath: join(tmp, "missing.mp4"), language: "en", settings: SETTINGS }),
    ).rejects.toThrow(/not found/i);
    expect(existsSync(root) ? await readdir(root) : []).toEqual([]);
  });

  it("fails without leaving a project folder when the settings are invalid", async () => {
    const sourcePath = await makeSource("in", "a.mp4");
    await expect(
      createProject({ root, sourcePath, language: "en", settings: { ...SETTINGS, clipCount: 0 } }),
    ).rejects.toThrow();
    expect(existsSync(root) ? await readdir(root) : []).toEqual([]);
  });
});

describe("readProject", () => {
  it("throws a clear error when project.json is missing or invalid", async () => {
    await mkdir(join(tmp, "broken"));
    await expect(readProject(join(tmp, "broken"), silentLogger)).rejects.toThrow(/not a clipper project/i);
    await writeFile(join(tmp, "broken", "project.json"), JSON.stringify({ schemaVersion: 1 }));
    await expect(readProject(join(tmp, "broken"), silentLogger)).rejects.toThrow(/not a clipper project/i);
  });
});
