# SPEC-050: Segment into sentences

| | |
|---|---|
| **Status** | Ready |
| **Milestone** | M1 |
| **Depends on** | SPEC-001, SPEC-040 |
| **Code** | `src/main/pipeline/segment/` (pure functions, no I/O except reading/writing the two files) |

## Goal

Group timed words into short numbered segments (roughly sentences). Segments are what the LLM
picks by ID (ADR-0003) and what clip edges snap to.

## Output

`stages/segments.json` (`SegmentsSchema`):

```ts
{ schemaVersion: 1, segments: Array<{ id: number; start: number; end: number;
  text: string; firstWord: number; lastWord: number }> }   // word indices into transcript.words
```

## Rules

- R1. A segment ends after a word for which `isSentenceEnd(word, lang)` is true (SPEC-001 R8).
- R2. A segment also ends at a pause of at least 0.8 s between words, even without punctuation.
  (Whisper often leaves Bangla/Hindi unpunctuated, so this rule does a lot of work.)
- R3. Maximum length 15 s: a longer segment is split at its longest internal pause (repeat until
  every part is ≤ 15 s). If there is no pause ≥ 0.2 s, split at the word nearest the middle.
- R4. Minimum length 1.0 s: a shorter segment merges into the following one (or the previous one
  if it is last), unless the merge would exceed 15 s.
- R5. IDs are consecutive integers from 0 in time order.
- R6. `text` is the words joined with single spaces and passed through `normalizeText`.
- R7. Pure and deterministic: the same transcript always gives the same segments.

## Language notes

- bn/hi: `।` and `॥` end sentences; `.` also does (Whisper sometimes uses it).
- en: `.` after common abbreviations (Mr. Dr. vs. e.g. i.e.) does not end a sentence.
- Code-mixed text: punctuation rules follow the project language.

## Acceptance criteria

- [ ] Bangla words ending in `।` split into separate segments; same for Hindi.
- [ ] Unpunctuated Bangla words with a 1.0 s pause split at the pause.
- [ ] A 40 s run-on sentence becomes segments ≤ 15 s, split at the longest pauses.
- [ ] A 0.4 s segment ("হ্যাঁ।") merges with its neighbour.
- [ ] "Dr. Rahman said…" stays one segment in en.
- [ ] IDs are 0..n−1, segments are contiguous and cover every word exactly once.

## Test plan

`src/main/pipeline/segment/segment.test.ts` with hand-written word arrays in bn, en and hi.
No fixtures or binaries needed — a good first stage for the agent to build.
