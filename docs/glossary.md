# Glossary

| Term | Meaning in this project |
|---|---|
| **Source video** | The user's original file. Never modified. |
| **Proxy** | Low-resolution copy (480p) used for preview and scrubbing in the UI. |
| **Project** | One source video plus everything generated from it, in one folder. |
| **Stage** | One step of the pipeline with typed input, typed output and a version. |
| **Manifest** | `manifest.json` in a project: which stages finished, with which inputs. |
| **Word** | One timed word from transcription: text, start, end, confidence. |
| **Segment** | One sentence (or a long sentence split at a pause), with a numeric ID. The unit the LLM picks. |
| **Window** | A slice of segments sent to the LLM in one call (sized by token budget). |
| **Candidate** | A clip the LLM proposed: start/end segment IDs, title, hook, scores. |
| **Clip** | A candidate after snapping, with exact times, ready to reframe and render. |
| **Snap** | Moving clip edges to sentence boundaries, pauses or scene cuts. |
| **Reframe** | Choosing the 9:16 crop over time (face tracking, layouts). |
| **Preset** | Platform output settings: size, fps, max length, caption safe zone. |
| **Profile** | Hardware profile (Lite / Balanced / Power) that picks default models and encoders. |
| **Language** | Exactly one of `bn`, `en`, `hi`, chosen per project. |
| **Code-mixing** | English words inside Bangla or Hindi speech (Banglish, Hinglish). Normal, must be supported. |
| **Conjunct** | Combined consonant glyph in Bangla/Hindi (ক্ষ, স্ট্র, क्ष, श्र). Breaks if text is split or styled mid-word. |
| **Danda** | `।` (U+0964), the full stop of Bangla and Hindi. `॥` (U+0965) is the double danda. |
| **Post rate** | Share of generated clips a creator actually posts. Our main quality metric. |
