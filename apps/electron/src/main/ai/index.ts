// SPEC-110: createStructuredAI(config, key) and createTranscriber(config, key) using the Vercel AI SDK
// (generateText + Output.object). No Electron imports here: the worker and the CLI both use it.
// Not built yet; install the AI SDK packages when you start SPEC-110.

export type { AiErrorKind, LlmProviderConfig, StructuredAI, TranscriptionProviderConfig, Transcriber } from "./types";
