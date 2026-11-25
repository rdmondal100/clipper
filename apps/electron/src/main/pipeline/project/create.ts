import { randomInt } from "node:crypto";
import { copyFile, mkdir, rm, stat } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { normalizeText } from "@shared/languages";
import type { LanguageCode } from "@shared/languages";
import { ProjectSchema } from "@shared/schemas";
import type { Project } from "@shared/schemas";
import type { Logger } from "../log";
import { errorCode, readJsonFile, writeJsonAtomic } from "./files";
import { emptyManifest, writeManifest } from "./manifest";
import { projectPaths } from "./paths";
import type { ProjectPaths } from "./paths";

type CreateProjectInput = {
  root: string; // projectsRoot (R1)
  sourcePath: string;
  language: LanguageCode;
  settings: Project["settings"];
  name?: string; // defaults to the source file name
  copySource?: boolean; // R3 "Copy source into project"
  now?: Date;
};

const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const PROJECT_FOLDERS = ["media", "stages", "exports", "logs"];

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

// R2: ASCII only and sorts by creation time; local clock so it matches what the user saw
function createProjectId(now: Date, random: (max: number) => number = randomInt) {
  const date = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`;
  const time = `${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;
  const suffix = Array.from({ length: 6 }, () => ID_ALPHABET[random(ID_ALPHABET.length)]).join("");
  return `${date}-${time}-${suffix}`;
}

async function statSource(sourcePath: string) {
  try {
    const info = await stat(sourcePath);
    if (info.isFile()) return info;
  } catch (error) {
    if (errorCode(error) !== "ENOENT") throw error;
  }
  throw new Error(`Source video not found: ${sourcePath}`);
}

// R3: stored relative to the project folder, so the project still works if the folder moves
async function copySourceInto(paths: ProjectPaths, sourcePath: string): Promise<Project["source"]> {
  const ext = extname(sourcePath).slice(1).toLowerCase();
  const target = paths.sourceCopy(/^[a-z0-9]{1,8}$/.test(ext) ? ext : "video");
  await copyFile(sourcePath, target);
  const info = await stat(target);
  return { path: `media/${basename(target)}`, sizeBytes: info.size, mtimeMs: info.mtimeMs, copied: true };
}

async function createProject(input: CreateProjectInput) {
  // kept byte for byte: NTFS doesn't normalize names, so an NFC copy of a Bangla path may not open
  const sourcePath = resolve(input.sourcePath);
  const info = await statSource(sourcePath);
  const now = input.now ?? new Date();
  const id = createProjectId(now);

  // validate before touching the disk, so bad settings never leave a folder behind
  const project = ProjectSchema.parse({
    schemaVersion: 1,
    id,
    name: normalizeText(input.name ?? basename(sourcePath, extname(sourcePath))) || id,
    createdAt: now.toISOString(),
    language: input.language,
    source: { path: sourcePath, sizeBytes: info.size, mtimeMs: info.mtimeMs, copied: false },
    settings: input.settings,
  });

  await mkdir(input.root, { recursive: true });
  const paths = projectPaths(join(input.root, id));
  await mkdir(paths.dir); // not recursive: never reuse an existing project folder
  try {
    for (const folder of PROJECT_FOLDERS) await mkdir(join(paths.dir, folder));
    const created = input.copySource ? { ...project, source: await copySourceInto(paths, sourcePath) } : project;
    await writeJsonAtomic(paths.project, created);
    await writeManifest(paths, emptyManifest());
    return { project: created, paths };
  } catch (error) {
    // a half-made folder would show up as a broken project
    await rm(paths.dir, { recursive: true, force: true });
    throw error;
  }
}

async function readProject(dir: string, log: Logger) {
  const project = await readJsonFile(projectPaths(dir).project, ProjectSchema, log);
  if (!project) throw new Error("Not a Clipper project: project.json is missing or invalid");
  return project;
}

export { createProject, createProjectId, readProject };
export type { CreateProjectInput };
