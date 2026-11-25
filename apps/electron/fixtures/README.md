# Fixtures

Test media and recorded responses, per language. **Videos are git-ignored** (size); JSON files
(recorded responses, golden outputs, reference transcripts) are committed.

```
fixtures/
  bn/  en/  hi/
    short.mp4               60–90 s, one speaker — used by integration tests (SPEC-030/040/090/100)
    monologue.mp4           3–5 min, studio            ┐
    podcast.mp4             3–5 min, two people        │ SPEC-180 evaluation set
    noisy.mp4               3–5 min, outdoor/phone     │ (5 per language)
    code-mixed.mp4          3–5 min, Banglish/Hinglish │
    lecture-music.mp4       3–5 min, music intro       ┘
    <name>.reference.txt    hand-corrected 2-minute reference transcript (SPEC-180)
  recorded/
    transcribe/             recorded cloud transcription responses (SPEC-040 tests)
    llm/                    recorded LLM responses per language (SPEC-060 tests, --replay-llm)
    faces/                  recorded face detections (SPEC-080 tests)
```

## Sources and licences

Use your own recordings or videos you have clear permission to use. Record each one here:

| File | Language | Source | Licence / permission | Notes |
|---|---|---|---|---|
| | | | | |

## Sharing the videos

Keep the originals in a shared drive (or Git LFS if you prefer) and note the link here, so a fresh
clone can get them: `<link>`.
