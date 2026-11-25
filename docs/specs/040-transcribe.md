# SPEC-040: Transcribe

| | |
|---|---|
| **Status** | Ready |
| **Milestone** | M1 |
| **Depends on** | SPEC-001, SPEC-030, SPEC-110 (transcription providers) |
| **Code** | `src/main/pipeline/transcribe/`, `src/main/media/whisper.ts` |

## Goal

Turn `audio_16k.wav` into timed words in the project language, locally (whisper.cpp) or with a
cloud provider, resumably and without the garbage Whisper sometimes produces.

## Non-goals

Speaker diarization (later, for split layouts). Translation. Real-time transcription.

## Output

`stages/transcript.json` (`TranscriptSchema`):

```ts
{
  schemaVersion: 1,
  language: "bn" | "en" | "hi",
  provider: string, model: string,
  durationSec: number,
  words: Array<{ w: string; s: number; e: number; p?: number }>, // text, start, end, confidence
  scriptCheck: { ok: true } | { ok: false; reason: string },
  warnings: string[]
}
```

## Providers

Behind one interface so the stage doesn't care which runs:

```ts
type Transcriber = {
  transcribeChunk(input: { wavPath: string; language: LanguageCode; prompt?: string;
                           signal: AbortSignal; onProgress: (f: number) => void }): Promise<Word[]>;
};
```

1. **Local — whisper.cpp** (`whisper-cli`): model file from the models folder; GPU build when
   available. Ask for word-level timing and JSON output.
2. **Cloud — OpenAI-compatible transcription endpoint** (Groq, OpenAI): `verbose_json` with word
   timestamps. Base URL, model and key come from SPEC-110.

## Rules

- R1. **Always pass the language explicitly** (`LANGUAGES[lang].whisperCode`). Never auto-detect here.
- R2. Pass `LANGUAGES[lang].whisperPrompt` as the initial prompt: a short native-script sentence
  ending with the right punctuation (`।` for bn/hi), which nudges Whisper to punctuate. Evaluate
  its effect in SPEC-180; remove it if it hurts.
- R3. **Chunking:** split the audio into chunks of at most 10 minutes, cutting in the quietest
  0.4 s+ region within ±60 s of each 10-minute mark (from `loudness.json`). Chunks are written as
  temporary WAV slices; word times are offset back to the full timeline.
- R4. **Resume:** each finished chunk is cached as `stages/transcribe-chunks/NN.json`. A rerun after a
  crash starts at the first missing chunk. Chunk cache is keyed by the stage input hash.
- R5. Cloud: up to 3 chunks in parallel, 3 retries with exponential backoff on 429/5xx, then fail.
  Local: one chunk at a time (the GPU/CPU is already saturated).
- R6. **Unicode safety:** whisper.cpp may emit tokens that are partial UTF-8 byte sequences for
  Bangla/Hindi. Join token bytes *before* decoding into words. The transcript must contain no
  U+FFFD replacement characters.
- R7. Normalize every word with `normalizeText` (SPEC-001). Drop empty words.
- R8. **Hallucination guards:**
  - drop words whose time range lies entirely in silence (loudness below −50 dBFS for the whole word);
  - collapse repetition loops: the same 3+-word phrase repeated more than 3 times in a row is kept
    once, with a warning;
  - drop known filler hallucinations at chunk ends only if they fall in silence
    (e.g. "Thank you for watching", "Subtitles by…"), list kept in the language registry.
- R9. Word times must be non-decreasing; fix small overlaps (< 50 ms) by clamping, drop words with
  `e <= s`.
- R10. Run `checkTranscriptScript` (SPEC-001 R13) and store the result; the job continues with a
  warning if it fails.

## Language notes

- bn/hi: recommend `large-v3-turbo` or bigger (registry `recommendedWhisperModel`); the UI marks
  smaller models as "low quality for Bangla/Hindi". Final defaults come from SPEC-180.
- Code-mixed speech: keep English words in whatever script Whisper wrote them (SPEC-001 R10).
- Hindi output in Arabic script (Urdu) is caught by the script check.

## Errors

| Case | Behaviour |
|---|---|
| Model file missing | Stage fails: "Download the {model} model in Settings" |
| whisper-cli crashes on a chunk | Retry that chunk once, then fail the stage |
| Cloud 401 | Fail: "API key rejected" (no retry) |
| Cloud 413 (file too large) | Re-split that chunk in half and retry |

## Acceptance criteria

- [ ] bn, en and hi fixtures produce transcripts valid by schema with monotonic times.
- [ ] The language flag is passed explicitly for both providers (asserted on the spawned args /
      the HTTP request body).
- [ ] No U+FFFD in any bn or hi transcript.
- [ ] Chunk boundaries fall in the quietest region near each 10-minute mark (unit test on a
      synthetic loudness curve).
- [ ] Killing the job after chunk 2 of 4 and rerunning transcribes only chunks 3–4.
- [ ] A synthetic repetition loop is collapsed with a warning.
- [ ] Cloud provider tested with recorded HTTP responses (mocked `fetch`), including 429 retry.
- [ ] Script-check failure produces a warning but the stage succeeds.

## Test plan

- Unit: chunk planner, word merging (incl. split UTF-8 bytes), repetition collapse, silence filter.
- Recorded responses: `fixtures/recorded/transcribe/*.json`.
- Integration (skipped without binaries/models): 60–90 s fixture per language.

## Open questions

- Exact whisper.cpp flags for word timing in the bundled version (record in implementation notes).
- Do we need VAD (whisper.cpp has VAD support in recent versions) on top of R8? Decide in SPEC-180.
