import type { LanguageCode } from "@shared/languages";
import type { Word } from "@shared/schemas";
import type { z } from "zod";

type AiErrorKind = "unreachable" | "auth" | "rate-limit" | "context-overflow" | "invalid-output" | "other";

// SPEC-110: the only LLM surface the pipeline sees; the AI SDK stays behind it
type StructuredAI = {
  id: string;
  model: string;
  contextTokens: number;
  generate: <T>(request: {
    system: string;
    prompt: string;
    schema: z.ZodType<T>;
    temperature?: number;
    maxOutputTokens?: number;
    signal: AbortSignal;
  }) => Promise<
    | { ok: true; value: T; usage: { inputTokens: number; outputTokens: number } }
    | { ok: false; kind: AiErrorKind; message: string }
  >;
};

// SPEC-040: one chunk of audio in, timed words out (times relative to the chunk)
type Transcriber = {
  id: string;
  model: string;
  transcribeChunk: (input: {
    wavPath: string;
    language: LanguageCode;
    prompt?: string;
    signal: AbortSignal;
    onProgress: (fraction: number) => void;
  }) => Promise<Word[]>;
};

// SPEC-110: provider settings as stored (keys live elsewhere, encrypted)
type LlmProviderConfig =
  | { id: string; kind: "ollama"; baseUrl: string; model: string; contextTokens: number }
  | { id: string; kind: "openai-compatible"; label: string; baseUrl: string; model: string; contextTokens: number }
  | { id: string; kind: "anthropic" | "openai" | "google"; model: string; contextTokens: number };

type TranscriptionProviderConfig =
  | { id: string; kind: "whisper-local"; model: "base" | "small" | "medium" | "large-v3-turbo" | "large-v3" }
  | { id: string; kind: "openai-compatible-transcription"; label: string; baseUrl: string; model: string };

export type { AiErrorKind, LlmProviderConfig, StructuredAI, TranscriptionProviderConfig, Transcriber };
