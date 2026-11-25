# SPEC-155: Settings, hardware profiles and onboarding

| | |
|---|---|
| **Status** | Draft |
| **Milestone** | M3 (settings, profiles), M5 (onboarding, model downloads) |
| **Depends on** | SPEC-110, SPEC-170, SPEC-180 (default models) |
| **Code** | `src/main/hardware/`, `src/main/settings/`, `src/renderer/src/pages/{Settings,Onboarding}.tsx` |

## Goal

Good defaults for each PC, so most users never have to understand models.

## Hardware profiles

| Profile | Detected when | Transcription default | LLM default | Encoder |
|---|---|---|---|---|
| Lite | no usable GPU or < 4 GB VRAM | cloud if a key exists, else local `small` (en) / warn for bn, hi | cloud if a key exists, else a small local model | software |
| Balanced | 6–8 GB VRAM | local `large-v3-turbo` | local 7–9B model | GPU encoder |
| Power | ≥ 12 GB VRAM | local `large-v3` | local 12B+ model or cloud | GPU encoder |

Final defaults per language come from SPEC-180. Detection: `app.getGPUInfo("complete")`, total RAM,
CPU threads, encoder test from SPEC-100 R1.

## Settings sections (draft)

1. **AI for finding clips** — provider list (SPEC-110), add/edit, key field (write-only), Test
   connection with per-language results, privacy label.
2. **Transcription** — local model (download/delete, size shown) or cloud provider; per-language
   quality hint ("Bangla: use large-v3-turbo or better").
3. **Output** — default platforms, clip count, length range, caption style, projects folder.
4. **Performance** — profile (auto/manual), encoder, threads.
5. **About** — versions of app and bundled tools, licences.

## Onboarding (M5)

Hardware check → recommended profile → choose languages you create in (bn/en/hi, multi-select) →
download the recommended Whisper model (resumable, checksum verified) → detect Ollama
(`GET <baseUrl>/api/tags`); if missing, explain and offer the cloud option → test connection →
done.

## Open questions

- Which local LLMs to recommend per profile and language (from SPEC-180 results).
- Model download source and checksums (official whisper.cpp model files; record URLs + SHA-256).
