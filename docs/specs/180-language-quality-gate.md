# SPEC-180: Language quality gate

| | |
|---|---|
| **Status** | Ready |
| **Milestone** | M1.5 |
| **Depends on** | M1 complete (SPEC-030 … SPEC-110) |
| **Code** | `scripts/eval-transcripts.ts`, `scripts/eval-clips.ts`, `fixtures/eval/` |

## Goal

Decide, with numbers, which transcription models and LLMs are good enough for Bangla, English and
Hindi, and what the defaults should be. This is the go/no-go for "local-first" in each language.

## Fixtures (5 per language, 3–5 min each)

| # | Kind | Why |
|---|---|---|
| 1 | One speaker, studio | baseline |
| 2 | Two-person podcast | turn-taking, overlaps |
| 3 | Outdoor / noisy / phone mic | robustness |
| 4 | Heavy code-mixing (Banglish / Hinglish) | the real-world norm |
| 5 | Lecture or religious talk with music intro | long pauses, music hallucinations |

Use your own recordings or content with clear permission/licence; record the source and licence in
`fixtures/README.md`. For each fixture, hand-correct a 2-minute reference transcript.

## Measurements

1. **Transcription accuracy** (`eval-transcripts.ts`): WER for en; **CER** for bn and hi (spacing in
   Indic text varies, so character error rate is fairer). Normalize (NFC, lowercase Latin, strip
   punctuation) before scoring.
2. **Speed**: real-time factor on the reference PCs (note CPU, GPU, VRAM).
3. **Clip quality** (`eval-clips.ts` + a rating sheet): for each LLM, generate clips for every
   fixture; rate each clip blind (you + one native speaker per language): "Would you post this?"
   yes/no, and title quality 1–5.
4. **Model language check** from SPEC-110 R7 for each LLM.

## Matrix

- Transcription: whisper.cpp `small`, `medium`, `large-v3-turbo`, `large-v3`; one or two cloud
  providers (e.g. Groq Whisper large-v3 and turbo).
- LLMs: 2–3 local 7–9B instruct models via Ollama, one 12B+ local model if hardware allows, one
  small cloud model, one strong cloud model.
- Also test: `whisperPrompt` on vs off (SPEC-040 R2); VAD on vs off.

## Decision rules (starting thresholds — adjust if they prove unrealistic)

- Default transcription per language = the cheapest/fastest option with clean-audio error
  ≤ 12% WER (en) / ≤ 15% CER (bn, hi).
- Default local LLM per language = highest "would post" rate. If no local model reaches 30%
  "would post" for a language, onboarding recommends a cloud model for that language and says why.
- Update the registry (`recommendedWhisperModel`, `charsPerToken`, `hallucinations`, thresholds in
  `checkTranscriptScript`) with what you measured.

## Output

- A filled-in results table in this spec (below).
- `docs/decisions/0007-default-models-per-language.md`.

## Acceptance criteria

- [ ] 15 fixtures with reference transcripts and licences recorded.
- [ ] Results table filled for every cell of the matrix that the hardware can run.
- [ ] ADR-0007 written; registry and SPEC-155 profile table updated.

## Results

| Language | Transcriber | WER/CER | RTF | Notes |
|---|---|---|---|---|
| bn | | | | |
| en | | | | |
| hi | | | | |

| Language | LLM | Would post % | Title 1–5 | Lang check | Notes |
|---|---|---|---|---|---|
| bn | | | | | |
| en | | | | | |
| hi | | | | | |
