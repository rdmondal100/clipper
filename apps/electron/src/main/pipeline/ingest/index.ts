import type { Stage } from "../stage";

// SPEC-030 — probe, 16 kHz WAV, 480p proxy, loudness curve. Not built yet.
function createIngestStage(): Stage {
  throw new Error("Not implemented: see docs/specs/030-ingest.md");
}

export { createIngestStage };
