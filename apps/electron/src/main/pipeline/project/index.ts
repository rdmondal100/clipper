// SPEC-010: project folders, atomic JSON files, manifest, source and disk-space checks.
// Pure Node, never Electron; trash and relink are the Electron side (src/main/projects, M3).

export { createProject, createProjectId, readProject } from "./create";
export type { CreateProjectInput } from "./create";
export { readJsonFile, removeTmpFiles, writeJsonAtomic } from "./files";
export { emptyManifest, missingOutputs, readManifest, recordStage, writeManifest } from "./manifest";
export { projectPaths } from "./paths";
export type { ProjectPaths } from "./paths";
export { checkSource, sourceFilePath } from "./source";
export type { SourceCheck } from "./source";
export { checkFreeSpace, estimateNeededBytes } from "./space";
export type { SpaceCheck } from "./space";
