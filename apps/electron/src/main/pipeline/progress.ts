import { STAGE_WEIGHTS } from "./stage";
import type { Stage, StageRef } from "./stage";

type ProgressUpdate = StageRef & { stageProgress: number; overall: number; note?: string };

const MIN_INTERVAL_MS = 250; // SPEC-020 R8: at most 4 updates per second

function clamp01(value: number) {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

// SPEC-020 R7: weighted progress over the stages this run covers; overall never goes backwards
function createProgress(input: { stages: Stage[]; now: () => number; onProgress?: (update: ProgressUpdate) => void }) {
  const { stages, now, onProgress } = input;
  const perClip = stages.filter((stage) => stage.perClip).map((stage) => stage.name);
  const total = stages.reduce((sum, stage) => sum + STAGE_WEIGHTS[stage.name], 0);
  let clipCount = 0;
  let doneWeight = 0;
  let overall = 0;
  let lastRef: StageRef | undefined;
  let lastEmitAt: number | undefined;
  let lastEmittedOverall = -1;

  // a per-clip stage's weight is shared by the clips this run processes
  function unitWeight(ref: StageRef) {
    const weight = STAGE_WEIGHTS[ref.stage];
    if (!perClip.includes(ref.stage)) return weight;
    return clipCount > 0 ? weight / clipCount : 0;
  }

  function emit(update: ProgressUpdate, force: boolean) {
    if (!onProgress) return;
    const at = now();
    // the first update always goes out (lastEmitAt is unset), so callers see 0
    if (!force && lastEmitAt !== undefined && at - lastEmitAt < MIN_INTERVAL_MS) return;
    lastEmitAt = at;
    lastEmittedOverall = update.overall;
    onProgress(update);
  }

  function report(ref: StageRef, stageProgress: number, note?: string) {
    lastRef = ref;
    overall = Math.max(overall, Math.min(1, (doneWeight + unitWeight(ref) * stageProgress) / total));
    emit({ ...ref, stageProgress, overall, ...(note === undefined ? {} : { note }) }, false);
  }

  return {
    setClipCount: (count: number) => {
      clipCount = count;
      // no clips to process: the per-clip stages have nothing left to do
      if (count === 0) for (const name of perClip) doneWeight += STAGE_WEIGHTS[name];
    },
    start: (ref: StageRef) => report(ref, 0),
    update: (ref: StageRef, fraction: number, note?: string) => report(ref, clamp01(fraction), note),
    complete: (ref: StageRef) => {
      doneWeight += unitWeight(ref);
      report(ref, 1);
    },
    // the last update always goes out, so callers see exactly 1 even if it was throttled or rounded
    finish: () => {
      if (!lastRef || lastEmittedOverall === 1) return;
      overall = 1;
      emit({ ...lastRef, stageProgress: 1, overall: 1 }, true);
    },
  };
}

export { createProgress };
export type { ProgressUpdate };
