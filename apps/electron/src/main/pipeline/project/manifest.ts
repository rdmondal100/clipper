import { stat } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { ManifestSchema } from "@shared/schemas";
import type { Manifest, StageName, StageRecord } from "@shared/schemas";
import type { Logger } from "../log";
import { readJsonFile, writeJsonAtomic } from "./files";
import type { ProjectPaths } from "./paths";

function emptyManifest(): Manifest {
  return { schemaVersion: 1, stages: {}, clips: {} };
}

// missing or invalid both mean "nothing cached yet": every stage reruns (R5)
async function readManifest(paths: ProjectPaths, log: Logger) {
  return (await readJsonFile(paths.manifest, ManifestSchema, log)) ?? emptyManifest();
}

async function writeManifest(paths: ProjectPaths, manifest: Manifest) {
  await writeJsonAtomic(paths.manifest, ManifestSchema.parse(manifest));
}

// R3/R8: which recorded outputs are gone (deleted by hand, or never written)
async function missingOutputs(dir: string, outputs: string[]) {
  const checks = await Promise.all(
    outputs.map((output) =>
      stat(join(dir, output)).then(
        () => undefined,
        () => output,
      ),
    ),
  );
  return checks.filter((output) => output !== undefined);
}

// R7/R8: per-clip stages go under clips[clipId]; a record is written only once its outputs exist
async function recordStage(
  paths: ProjectPaths,
  entry: { stage: StageName; record: StageRecord; clipId?: string },
  log: Logger,
) {
  const { stage, record, clipId } = entry;
  const absolute = record.outputs.filter((output) => isAbsolute(output));
  if (absolute.length > 0) throw new Error(`Stage ${stage} outputs must be relative to the project folder`);
  const missing = await missingOutputs(paths.dir, record.outputs);
  if (missing.length > 0) throw new Error(`Stage ${stage} finished without writing: ${missing.join(", ")}`);

  const manifest = await readManifest(paths, log);
  if (clipId === undefined) {
    manifest.stages[stage] = record;
  } else {
    const clipRecords = manifest.clips[clipId] ?? {};
    clipRecords[stage] = record;
    manifest.clips[clipId] = clipRecords;
  }
  await writeManifest(paths, manifest);
  return manifest;
}

export { emptyManifest, missingOutputs, readManifest, recordStage, writeManifest };
