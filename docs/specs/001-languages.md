# SPEC-001: Languages — Bangla, English, Hindi

| | |
|---|---|
| **Status** | Ready (M0 part implemented in the starter as the reference example) |
| **Milestone** | M0 (registry + helpers), rules apply to every later spec |
| **Depends on** | ADR-0004 |
| **Code** | `apps/electron/src/shared/languages.ts`, `languages.test.ts` |

## Goal

Make Bangla (`bn`), English (`en`) and Hindi (`hi`) first-class everywhere: transcription, clip
selection, titles, captions and UI text. All per-language values live in **one registry** so no
other file branches on language codes.

## Non-goals

- Other languages (Urdu, Nepali, Assamese, Marathi… even when scripts overlap).
- Transliteration (Bangla/Hindi ↔ Latin) and translation between languages.
- Translating the app's own UI (M6). UI strings must still be kept in one place so they can be.

## The registry

`src/shared/languages.ts` exports `LANGUAGES: Record<LanguageCode, LanguageInfo>` with:

| Field | bn | en | hi |
|---|---|---|---|
| `name` / `nativeName` | Bangla / বাংলা | English / English | Hindi / हिन्दी |
| `whisperCode` | `bn` | `en` | `hi` |
| `script` (ISO 15924) | `Beng` | `Latn` | `Deva` |
| `sentenceEnders` | `। ॥ ? ! .` | `. ? ! …` | `। ॥ ? ! .` |
| `captionFont` (candidate, confirm in SPEC-090) | Hind Siliguri Bold | Montserrat ExtraBold | Hind Bold |
| `captionMaxGraphemesPerLine` (tune in M2) | 16 | 20 | 16 |
| `charsPerToken` (conservative, calibrate in M1) | 1.0 | 3.5 | 1.2 |
| `recommendedWhisperModel` (provisional until SPEC-180) | large-v3-turbo | small | large-v3-turbo |
| `promptName` | Bangla (Bengali script) | English | Hindi (Devanagari script) |
| `whisperPrompt` (evaluate in SPEC-180) | আজকের আলোচনায় আমরা কথা বলব। | Today we're going to talk about this. | आज की चर्चा में हम बात करेंगे। |
| `continuationWords` (SPEC-070) | আর, কিন্তু, তো, তাহলে, মানে | and, but, so, because, then | और, लेकिन, तो, क्योंकि, मतलब |
| `hallucinations` (SPEC-040) | (fill from SPEC-180 findings) | Thank you for watching. / Subtitles by | (fill from SPEC-180 findings) |

Helpers exported from the same file:

- `isLanguageCode(value): value is LanguageCode`
- `normalizeText(text)`: NFC, keep ZWJ/ZWNJ, collapse whitespace runs to one space, trim
- `countGraphemes(text, lang)`, `truncateGraphemes(text, max, lang)`: never split a grapheme cluster
- `scriptShares(text)`: share of letters per script (`Beng`, `Deva`, `Latn`, `Arab`, `Other`),
  ignoring digits, punctuation and spaces
- `checkTranscriptScript(text, lang)`: `{ ok: true } | { ok: false; reason }`
- `isSentenceEnd(token, lang)`: does this word end a sentence

## Rules

**Choosing the language**

- R1. Every project has exactly one language, chosen by the user when the project is created.
  The default is the last language used.
- R2. "Detect for me" may suggest a language (Whisper language detection on three 30-second
  samples from the start, middle and end; only `bn`/`en`/`hi` are considered). The user confirms
  before transcription starts.
- R3. The language code is always passed explicitly to transcription. Never let Whisper
  auto-detect during the real transcription (it confuses Hindi with Urdu and switches script).

**Text handling**

- R4. All transcript text is normalized with `normalizeText` before it is stored or compared.
- R5. ZWJ (U+200D) and ZWNJ (U+200C) are kept. They change how Bangla renders (e.g. র‍্যা).
- R6. Text is never split, truncated or styled inside a grapheme cluster. Conjuncts like ক্ষ, স্ট্র,
  क्ष, श्र must stay whole. Style changes (caption highlight colour) happen only between words.
- R7. Lengths shown to users or enforced on titles/hooks are counted in graphemes, not UTF-16 units.
- R8. Sentence ends: `।` and `॥` for bn and hi, plus `? !` and `.` (Whisper sometimes writes `.`
  in Bangla/Hindi). English uses `. ? ! …`.
- R9. Digits are kept as transcribed (Bangla ০–৯, Devanagari ०–९ or Latin). No conversion in v1.

**Code-mixing (Banglish, Hinglish)**

- R10. English words inside Bangla/Hindi speech are normal. Keep whatever script Whisper wrote
  them in; don't transliterate.
- R11. Caption fonts must cover both the native script and Latin, so mixed lines render in one
  font (Hind Siliguri and Hind both do). Verified by a render test in SPEC-090.
- R12. The LLM prompt tells the model that speakers mix in English and that this is not an error.

**Script check**

- R13. After transcription, `checkTranscriptScript` runs on the whole transcript. Letters *and*
  vowel signs are counted (Bangla/Hindi vowel signs are combining marks; skipping them makes
  native words look much shorter than English ones). Latin letters are allowed in bn/hi because of
  code-mixing, so the check looks at two things:
  - `bn` / `hi`: (a) of all non-Latin letters, more than 20% are in another script (Devanagari or
    Arabic in a Bangla project; Bengali or Arabic in a Hindi project — Arabic usually means Whisper
    wrote Urdu) → warn; (b) native-script letters are under 15% of all letters → warn ("mostly Latin
    letters — is the language right?").
  - `en`: warn if Latin letters are under 90% of all letters.
  - A warning doesn't stop the job; the UI shows "The transcript doesn't look like {language}.
    Check the project language." Thresholds are tuned in SPEC-180.

**AI output**

- R14. Titles, hooks, descriptions and hashtags are written in the project language, in its native
  script. English words may appear if the speaker used them.
- R15. Instructions to the LLM are written in English (models follow English instructions best);
  the transcript is sent in its original script.
- R16. LLM token budgets use `charsPerToken` from the registry (Bangla/Hindi cost far more tokens
  per character than English). Calibrate with real usage numbers in M1 and update the registry.

**UI**

- R17. The renderer bundles the caption fonts too, and every element that shows transcript text
  sets `lang="bn" | "en" | "hi"` so the browser shapes and picks fonts correctly.
- R18. UI strings live in `src/renderer/src/lib/strings.ts` (English in v1), never inline in JSX,
  so a Bangla/Hindi UI can be added in M6.

## Acceptance criteria

M0 (registry and helpers — done in the starter):

- [x] `LANGUAGES` has exactly `bn`, `en`, `hi`, each with every field in the table.
- [x] `isLanguageCode` accepts only those three codes.
- [x] `normalizeText` returns NFC, keeps ZWJ/ZWNJ, collapses whitespace, trims.
- [x] `countGraphemes("ক্ষমা", "bn") === 2` and `countGraphemes("क्षमा", "hi") === 2`.
- [x] `truncateGraphemes` never returns a string ending in a virama (্ U+09CD, ् U+094D).
- [x] `checkTranscriptScript`: Bangla text passes for `bn`; Hindi text fails for `bn`; Urdu text
      fails for `hi`; code-mixed "আমি freelancing করি, it's great" passes for `bn`.
- [x] `isSentenceEnd` is true for `।` in bn and hi, false for `।` in en.

Later (checked in the specs that use them):

- [ ] Transcription passes the language explicitly (SPEC-040).
- [ ] Segmenting splits on `।` (SPEC-050).
- [ ] Titles/hooks come back in the project's script for all three fixtures (SPEC-060).
- [ ] Mixed-script caption line renders correctly in all three fonts (SPEC-090).
- [ ] Renderer sets `lang` on transcript text (SPEC-150).

## Test plan

- `src/shared/languages.test.ts` (pure, no fixtures).
- Language fixtures for later specs live in `apps/electron/fixtures/{bn,en,hi}/` — see
  `fixtures/README.md`.

## Open questions

- Final caption fonts: confirm Hind Siliguri / Hind / Montserrat after the SPEC-090 render test,
  or switch to Noto Sans Bengali / Noto Sans Devanagari.
- `charsPerToken` real values per provider (measure in M1).

## Implementation notes

- Grapheme handling uses `Intl.Segmenter(..., { granularity: "grapheme" })`. Modern ICU (Unicode
  15.1+) keeps Bengali and Devanagari conjuncts in one cluster; the tests prove the runtime does.
