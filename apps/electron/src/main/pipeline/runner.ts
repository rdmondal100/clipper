import type { StageName } from "@shared/schemas";
import type { Logger } from "./log";
import type { Stage } from "./stage";

type RunOptions = {
  from?: StageName;
  to?: StageName;
  force?: StageName[];
  clipIds?: string[];
  signal: AbortSignal;
  onProgress?: (update: { stage: StageName; stageProgress: number; overall: number; note?: string }) => void;
};

type RunResult =
  | { ok: true; ran: StageName[]; skipped: StageName[] }
  | { ok: false; stage: StageName; message: string; cancelled?: false }
  | { ok: false; cancelled: true };

// SPEC-020: runs stages in order with caching, resume, progress and cancel. Not built yet.
function createRunner(deps: { stages: Stage[]; log: Logger }) {
  return {
    run: async (_projectDir: string, _options: RunOptions): Promise<RunResult> => {
      void deps;
      throw new Error("Not implemented: see docs/specs/020-pipeline-runner.md");
    },
  };
}

type Runner = ReturnType<typeof createRunner>;

export { createRunner };
export type { RunOptions, RunResult, Runner };
