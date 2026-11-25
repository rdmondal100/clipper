# SPEC-110: AI providers and API keys

| | |
|---|---|
| **Status** | Ready |
| **Milestone** | M1 (CLI use), M3 (settings UI via SPEC-155) |
| **Depends on** | SPEC-001 |
| **Code** | `src/main/ai/` (no Electron — used by the worker and the CLI), `src/main/settings/keyStore.ts` (Electron, `safeStorage`) |

## Goal

Let the user pick any LLM — local Ollama, any OpenAI-compatible server (LM Studio, Groq,
OpenRouter, vLLM), Anthropic, OpenAI or Google — and any transcription provider, behind two small
interfaces the pipeline uses. Keys stay encrypted and never reach the renderer.

## Interfaces used by the pipeline

```ts
type StructuredAI = {
  id: string; model: string; contextTokens: number;
  generate<T>(req: { system: string; prompt: string; schema: z.ZodType<T>;
                     temperature?: number; maxOutputTokens?: number; signal: AbortSignal })
    : Promise<{ ok: true; value: T; usage: { inputTokens: number; outputTokens: number } }
            | { ok: false; kind: "unreachable" | "auth" | "rate-limit" | "context-overflow" | "invalid-output" | "other"; message: string }>;
};

type Transcriber = /* see SPEC-040 */;
```

## Provider configs (stored in settings, keys stored separately)

```ts
type LlmProviderConfig =
  | { id: string; kind: "ollama"; baseUrl: string; model: string; contextTokens: number }      // default http://localhost:11434, 8192
  | { id: string; kind: "openai-compatible"; label: string; baseUrl: string; model: string; contextTokens: number }
  | { id: string; kind: "anthropic" | "openai" | "google"; model: string; contextTokens: number };

type TranscriptionProviderConfig =
  | { id: string; kind: "whisper-local"; model: "base" | "small" | "medium" | "large-v3-turbo" | "large-v3" }
  | { id: string; kind: "openai-compatible-transcription"; label: string; baseUrl: string; model: string };
```

## Rules

- R1. Implement `StructuredAI` with the Vercel AI SDK: `generateText({ model, output:
  Output.object({ schema }) })`, reading `result.output`. Don't use the deprecated `generateObject`.
- R2. Ollama must get an explicit context size matching `contextTokens` (its default is small and
  silently truncates long prompts). Decide in M1 between a native Ollama provider package (can set
  `num_ctx` per request) and the OpenAI-compatible endpoint (context set on the Ollama side); test
  both with a 6,000-token Bangla prompt and record the choice in implementation notes.
- R3. Map provider errors to `kind`: connection refused → `unreachable` ("Ollama isn't running.
  Start it, or pick another provider."), 401/403 → `auth`, 429 → `rate-limit` (retry 3× with
  backoff inside `generate`), context errors → `context-overflow`, schema failure →
  `invalid-output` (include the raw text, truncated, in the debug log only).
- R4. Timeouts: 180 s per call for local providers, 90 s for cloud. Configurable.
- R5. **Keys:** encrypted with Electron `safeStorage` in `<userData>/keys.bin` (same approach as
  WorkPulse's token store). If `safeStorage` isn't available, refuse to save and say why.
- R6. The renderer only ever sees `{ hasKey: boolean; last4?: string }`. Keys are given to the job
  worker in memory when a job starts and are never written to project folders or logs. Error
  messages are scrubbed of anything that looks like the key.
- R7. **Test connection** runs three checks and reports each: (1) reachable, (2) returns valid
  structured output for a tiny schema, (3) language check for bn, en and hi — a 5-sentence numbered
  passage in that language and the question "which sentence mentions X?"; pass if it returns the
  right ID. Also report average latency and output tokens per second.
- R8. **Privacy label:** local providers → "Nothing leaves this computer". Cloud providers →
  "The transcript text is sent to {provider}. Your video is not uploaded."
- R9. CLI reads keys from environment variables (`CLIPPER_ANTHROPIC_KEY`, `CLIPPER_OPENAI_KEY`,
  `CLIPPER_GOOGLE_KEY`, `CLIPPER_OPENAI_COMPAT_KEY`, `CLIPPER_TRANSCRIBE_KEY`) or a git-ignored
  `apps/electron/.env.local`.

## Language notes

The language check (R7) is what tells a user "this model understands English but struggles with
Bangla". The UI shows the result per language next to the model.

## Acceptance criteria

- [ ] A fake HTTP server test for each provider kind: success, 401, 429-then-success, malformed JSON.
- [ ] `generate` returns `invalid-output` (not a throw) when the output fails the schema.
- [ ] Ollama requests carry the configured context size (asserted on the request).
- [ ] Keys: renderer-facing settings never include key material (unit test on the settings
      serializer); a log line containing a key is scrubbed.
- [ ] Test connection returns per-language results (fake model answering bn wrong, en/hi right →
      bn fail, others pass).

## Test plan

`src/main/ai/*.test.ts` with a local fake HTTP server (node `http`), no real network.

## Open questions

- Which packages exactly (AI SDK provider packages vs a community Ollama provider) — decided in M1,
  recorded here.
