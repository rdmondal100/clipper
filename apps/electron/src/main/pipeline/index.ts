import type { Preset } from "@shared/schemas";
import type { StructuredAI, Transcriber } from "../ai/types";
import type { Bins } from "../media";
import type { Logger } from "./log";
import { createRunner } from "./runner";
import type { Stage } from "./stage";

// everything the pipeline needs from outside; main, the worker, the CLI and tests each supply their own
type PipelineDeps = {
  bins: Bins;
  fontsDir: string;
  modelsDir: string;
  presets: Preset[];
  ai?: StructuredAI; // SPEC-110, required from SPEC-060 on
  transcriber?: Transcriber; // SPEC-040
  log: Logger;
};

// add each stage here when its spec is Done, in STAGE_ORDER:
// createIngestStage, createTranscribeStage, createSegmentStage, createHighlightsStage,
// createSnapStage, createReframeStage, createCaptionsStage, createRenderStage
function buildStages(_deps: PipelineDeps): Stage[] {
  return [];
}

function createPipeline(deps: PipelineDeps) {
  const stages = buildStages(deps);
  // the names let callers check up front what a run needs, e.g. the CLI's binary check (SPEC-160 R4)
  return { ...createRunner({ stages, log: deps.log }), stages: stages.map((stage) => stage.name) };
}

type Pipeline = ReturnType<typeof createPipeline>;

export { createPipeline };
export type { Pipeline, PipelineDeps };
