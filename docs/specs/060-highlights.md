# SPEC-060: Find highlights with an LLM

| | |
|---|---|
| **Status** | Ready |
| **Milestone** | M1 |
| **Depends on** | SPEC-001, SPEC-050, SPEC-110, ADR-0003 |
| **Code** | `src/main/pipeline/highlights/` (`windows.ts`, `prompts/`, `validate.ts`, `rank.ts`, `index.ts`) |

## Goal

Pick the best standalone moments from a transcript of any length, with any model from a 7B local
model to a large cloud model, in Bangla, English or Hindi.

## Non-goals

Vision models looking at frames. Learning from what users posted (later).

## Inputs and outputs

- In: `segments.json`, `loudness.json`, project settings `{ clipCount (default 10), minSec (20),
  maxSec (60), contentType? }`, an injected `ai: StructuredAI` (SPEC-110).
- Out: `stages/candidates.json` (`CandidatesSchema`):

```ts
{
  schemaVersion: 1, promptVersion: string, provider: string, model: string,
  candidates: Array<{
    id: string;                       // "c01".."cNN" in final rank order
    startSegmentId: number; endSegmentId: number;
    start: number; end: number;       // from segment times (before snapping)
    title: string; hook: string;      // project language, native script
    reason: string;                   // English, shown in the review UI
    scores: { hook: number; standalone: number; payoff: number; emotion: number; clarity: number }; // 1..10
    total: number;                    // 0..100, see R7
    windowIndex: number;
  }>,
  warnings: string[],
  usage: { calls: number; inputTokens: number; outputTokens: number }
}
```

## Rules

**Windows (map-reduce so any length works)**

- R1. Split segments into windows by **token budget**, not minutes:
  `estimatedTokens = chars / LANGUAGES[lang].charsPerToken`. Budget per window =
  `min(provider.contextTokens × 0.5, 6000)` minus the prompt's own size. (Bangla/Hindi windows hold
  fewer minutes than English ones; that's expected.)
- R2. Consecutive windows overlap by about 60 s of segments, so a moment on a border isn't lost.
- R3. Each segment is sent as `[id] text` on its own line, with its duration: `[142] (6.1s) …`.

**Map call (one per window)**

- R4. Ask for 0–3 candidates per window, each `startSegmentId`..`endSegmentId` lasting between
  `minSec` and `maxSec`, using the rubric: hook (first 3 seconds grab attention), standalone (makes
  sense without the rest of the video), payoff (ends on a conclusion/punchline), emotion, clarity.
- R5. Prompt rules (from SPEC-001): instructions in English; transcript in its original script;
  "Write `title` and `hook` in {promptName}, the language of the video. Speakers often mix in
  English words; that is normal." Prompts live in versioned files (`prompts/map.v1.md`,
  `rank.v1.md`) plus one short example per language (`examples.bn.md` etc.). `promptVersion` is part
  of the stage input hash.
- R6. Validate each candidate (`validate.ts`): IDs exist in this window, `start ≤ end`, duration
  within `[minSec × 0.8, maxSec × 1.2]` (snapping adjusts later), scores are integers 1–10, title
  and hook non-empty. Titles over 60 graphemes and hooks over 120 are truncated grapheme-safely.
  Invalid candidates are dropped. If a window returned candidates but all were invalid, retry once
  with the list of errors appended. If it fails again, the window yields nothing and a warning is
  recorded — the job continues.
- R7. `total = 10 × (0.30 hook + 0.25 standalone + 0.20 payoff + 0.15 emotion + 0.10 clarity)`,
  plus a loudness bonus of up to ±5 points (z-score of the clip's mean RMS against the whole video,
  clamped), clamped to 0..100.
- R8. Script check on titles: if a `bn`/`hi` title contains no native-script letters, retry that
  window once with a reminder; then keep it with a warning.

**Merge and rank**

- R9. Remove duplicates: if two candidates overlap by more than 50% of the shorter one, keep the
  higher `total`.
- R10. If more than `2 × clipCount` candidates remain, make one rank call with a compact list
  (index, title, hook, total, first segment text) asking for the best `clipCount` with topic
  variety. Validate the returned indices; on failure fall back to sorting by `total`.
- R11. Final list: at most `clipCount`, sorted by rank, ids `c01…`.
- R12. Temperature 0.2. Sum token usage from every call into `usage`.

## Language notes

- `charsPerToken` drives window size (R1).
- Titles/hooks native script (R5, R8); `reason` in English for the v1 UI.
- One example per language in the prompt, so small models see the expected script.

## Errors

| Case | Behaviour |
|---|---|
| Provider unreachable | Stage fails with SPEC-110's message (e.g. "Ollama isn't running") |
| Context overflow error | Shrink the window budget by 30% and retry that window (max 2 times) |
| Zero candidates overall | Stage succeeds with a warning: "No clips found — try a stronger model" |

## Acceptance criteria

- [ ] Window builder: for the same 30-minute synthetic transcript, bn produces more windows than en;
      no window exceeds its budget; windows overlap.
- [ ] A fake AI returning an invalid ID then a valid answer produces a valid candidate after one retry.
- [ ] Out-of-range durations are dropped; long titles are truncated without splitting graphemes.
- [ ] Duplicates (>50% overlap) are removed.
- [ ] With 25 candidates and `clipCount` 10, a rank call is made; a bad rank answer falls back to
      sorting by total.
- [ ] Prompt snapshot tests: the rendered map prompt for each language fixture matches the stored
      snapshot (catches accidental prompt edits).
- [ ] Recorded real responses (one per language, from a local model) parse and validate.
- [ ] `usage` sums all calls.

## Test plan

- Unit tests with a fake `StructuredAI` that replays responses from `fixtures/recorded/llm/`.
- Real-model quality is judged in SPEC-180, not in unit tests.

## Open questions

- Should `contentType` (podcast, lecture, religious talk, tutorial, vlog) change the rubric weights?
  Start with prompt wording only.
