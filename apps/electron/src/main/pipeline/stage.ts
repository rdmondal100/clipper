import type { Project, StageName } from "@shared/schemas";
import type { Logger } from "./log";
import type { ProjectPaths } from "./project/paths";

// SPEC-020: what every stage gets while it runs
type StageContext = {
  dir: ProjectPaths;
  project: Project;
  signal: AbortSignal; // pass to every child process and fetch
  progress: (fraction: number, note?: string) => void; // 0..1 within this stage
  log: Logger;
};

// SPEC-020: the contract every stage implements; factories inject dependencies (bins, ai, faces)
type Stage = {
  name: StageName;
  version: number; // bump when the output format or logic changes, so cached results rerun
  perClip: boolean; // reframe, captions, render run once per clip
  readsSource: boolean; // ingest, render: the runner checks the source first (SPEC-020 R11)
  settingsKey: (project: Project) => unknown; // only the settings that change this stage's output
  run: (ctx: StageContext, clipId?: string) => Promise<{ outputs: string[] }>; // absolute or project-relative
};

// one unit of work: a whole-project stage, or a per-clip stage for one clip
type StageRef = { stage: StageName; clipId?: string };

const STAGE_ORDER: readonly StageName[] = [
  "ingest",
  "transcribe",
  "segment",
  "highlights",
  "snap",
  "reframe",
  "captions",
  "render",
];

// SPEC-020 R7: starting weights for overall progress, tuned in M1
const STAGE_WEIGHTS: Record<StageName, number> = {
  ingest: 5,
  transcribe: 35,
  segment: 1,
  highlights: 15,
  snap: 1,
  reframe: 13,
  captions: 2,
  render: 28,
};

function stageIndex(name: StageName) {
  return STAGE_ORDER.indexOf(name);
}

export { STAGE_ORDER, STAGE_WEIGHTS, stageIndex };
export type { Stage, StageContext, StageRef };
