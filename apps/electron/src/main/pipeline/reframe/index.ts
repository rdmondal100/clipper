import type { Stage } from "../stage";

// SPEC-080 — 9:16 crop path from face detection (M2). Not built yet.
function createReframeStage(): Stage {
  throw new Error("Not implemented: see docs/specs/080-reframe.md");
}

export { createReframeStage };
