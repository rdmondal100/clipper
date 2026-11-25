# SPEC-070: Snap clip edges

| | |
|---|---|
| **Status** | Ready (M1 rules); M2 adds scene cuts |
| **Milestone** | M1, polish in M2 |
| **Depends on** | SPEC-001, SPEC-050, SPEC-060 |
| **Code** | `src/main/pipeline/snap/` |

## Goal

Turn candidates into clips whose edges sound natural: they start at the beginning of a sentence,
end just after the last word, sit in pauses where possible, and respect the platform's length limits.

## Output

`stages/clips.json` (`ClipsSchema`): `clips: Array<{ id; candidateId; start; end; firstSegment;
lastSegment; title; hook; total; flags: string[] }>`. `id` equals the candidate id.

## Rules

- R1. Start = start of the first word of `startSegmentId` − 0.15 s, but not earlier than the end of
  the previous word + 0.02 s.
- R2. End = end of the last word of `endSegmentId` + 0.30 s, but not later than the start of the
  next word − 0.02 s.
- R3. If a pause (loudness below −40 dBFS for ≥ 0.25 s) begins within 0.8 s outside an edge, move
  the edge into the middle of that pause instead.
- R4. Too short (< `minSec`): add the next segment (or the previous one if at the end of the video)
  until long enough, as long as it stays ≤ `maxSec`. Too long (> `maxSec`): drop trailing segments
  while still ≥ `minSec`. If neither works, drop the clip with a warning.
- R5. If the first word is in `LANGUAGES[lang].continuationWords` ("and", "কিন্তু", "लेकिन"…), add
  the flag `starts-mid-thought` and subtract 3 points from `total` (don't move the edge in v1).
- R6. **M2:** detect scene cuts in the proxy within ±3 s of each edge (ffmpeg scene score > 0.35).
  If a cut lies within 0.3 s inside the clip start, move the start to the cut so the clip doesn't
  open with one or two frames of the previous shot.
- R7. Clips are re-sorted by `total` after R5.

## Acceptance criteria

- [ ] Edges never cut inside a word (property test over random word arrays).
- [ ] An edge moves into a nearby pause per R3 (synthetic loudness).
- [ ] Length enforcement per R4, including the drop case.
- [ ] `starts-mid-thought` is flagged for "কিন্তু", "लेकिन" and "But" openings.
- [ ] (M2) A scene cut 0.2 s after the start moves the start to the cut.

## Test plan

`src/main/pipeline/snap/snap.test.ts`, pure functions with synthetic words/loudness.
