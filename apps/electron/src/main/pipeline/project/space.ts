import { statfs as nodeStatfs } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { errorCode } from "./files";

type Statfs = (path: string) => Promise<{ bavail: number; bsize: number }>;

type SpaceCheck = { enough: boolean; freeBytes: number; neededBytes: number };

const GIB = 1024 ** 3;

// SPEC-010 R9: WAV, proxy and exports take about 0.5 GB per hour of source, plus 1 GB headroom
function estimateNeededBytes(durationSec: number) {
  return Math.ceil((durationSec / 3600) * 0.5 * GIB) + GIB;
}

// the projects folder may not exist on first run; its nearest existing parent is on the same drive
async function statfsNearest(statfs: Statfs, dir: string): Promise<{ bavail: number; bsize: number }> {
  try {
    return await statfs(dir);
  } catch (error) {
    const parent = dirname(dir);
    if (errorCode(error) !== "ENOENT" || parent === dir) throw error;
    return statfsNearest(statfs, parent);
  }
}

// R9: run before ingest; when not enough, the caller warns and lets the user continue or cancel
async function checkFreeSpace(dir: string, durationSec: number, deps: { statfs?: Statfs } = {}): Promise<SpaceCheck> {
  const info = await statfsNearest(deps.statfs ?? nodeStatfs, resolve(dir));
  const freeBytes = info.bavail * info.bsize;
  const neededBytes = estimateNeededBytes(durationSec);
  return { enough: freeBytes >= neededBytes, freeBytes, neededBytes };
}

export { checkFreeSpace, estimateNeededBytes };
export type { SpaceCheck, Statfs };
