import type { Stage } from "../stage";

// SPEC-060 — map-reduce LLM clip selection by segment ID. Not built yet.
function createHighlightsStage(): Stage {
  throw new Error("Not implemented: see docs/specs/060-highlights.md");
}

export { createHighlightsStage };
