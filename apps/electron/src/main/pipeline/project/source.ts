import { stat } from "node:fs/promises";
import { join } from "node:path";
import type { Project } from "@shared/schemas";
import type { ProjectPaths } from "./paths";

type SourceCheck = { ok: true } | { ok: false; status: "sourceMissing"; reason: "missing" | "changed" };

// a copied source is stored relative to the project folder (R3), a referenced one as given
function sourceFilePath(paths: ProjectPaths, project: Project) {
  return project.source.copied ? join(paths.dir, project.source.path) : project.source.path;
}

// SPEC-010 R4: stages that read the source refuse to run until this is ok (or the user relinks)
async function checkSource(paths: ProjectPaths, project: Project): Promise<SourceCheck> {
  let info;
  try {
    info = await stat(sourceFilePath(paths, project));
  } catch {
    // unplugged drive, offline share, deleted file: all mean "find it again"
    return { ok: false, status: "sourceMissing", reason: "missing" };
  }
  if (!info.isFile()) return { ok: false, status: "sourceMissing", reason: "missing" };
  if (info.size !== project.source.sizeBytes || info.mtimeMs !== project.source.mtimeMs) {
    return { ok: false, status: "sourceMissing", reason: "changed" };
  }
  return { ok: true };
}

export { checkSource, sourceFilePath };
export type { SourceCheck };
