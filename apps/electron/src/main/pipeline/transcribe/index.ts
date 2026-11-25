import type { Stage } from "../stage";

// SPEC-040 — timed words via whisper.cpp or a cloud provider, chunked and resumable. Not built yet.
function createTranscribeStage(): Stage {
  throw new Error("Not implemented: see docs/specs/040-transcribe.md");
}

export { createTranscribeStage };
