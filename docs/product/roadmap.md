# Roadmap

Build in this order. Each milestone ends with something you can run and judge. Don't start a
milestone until the previous one's exit check passes.

## M0 — Foundation

The repo builds, the app opens an empty window, the CLI runs a no-op pipeline, and the guard rails
exist.

| Spec | Part |
|---|---|
| SPEC-002 | Dependencies, scripts, empty window, guard test |
| SPEC-001 | Language registry + script detection (`src/shared/languages.ts`) |
| SPEC-010 | Project folder layout and cache manifest |
| SPEC-020 | `Stage` type and runner with caching/resume |
| SPEC-160 | CLI skeleton that runs the runner with zero stages |
| SPEC-170 | `npm run check:bins` (M0 part only) |

**Exit check:** `npm run typecheck && npm test` pass; `npm run dev` opens a window;
`npm run clip -- fixtures/en/monologue.mp4 --lang en` creates a project folder with a manifest.

## M1 — CLI vertical slice (all three languages)

From the terminal: a video in, captioned 9:16 clips out. Center crop, simple captions.

| Spec | Part |
|---|---|
| SPEC-030 | Ingest |
| SPEC-040 | Transcribe (whisper.cpp local + one cloud provider) |
| SPEC-050 | Segment |
| SPEC-110 | AI providers (Ollama, OpenAI-compatible, Anthropic, Gemini) |
| SPEC-060 | Highlights |
| SPEC-070 | Snap |
| SPEC-090 | Captions (M1 part: static line captions) |
| SPEC-100 | Render (center crop, one preset) |

**Exit check:** the bn, en and hi fixtures each produce at least 3 clips you would post, with
correct-looking captions.

## M1.5 — Language quality gate (go / no-go)

| Spec | Part |
|---|---|
| SPEC-180 | Measure transcription + clip quality per language and per model; pick defaults |

**Exit check:** a filled-in results table in SPEC-180 and a decision ADR on default models per
language. If local Bangla or Hindi quality is too low, the default for that language becomes
cloud transcription, and the UI says so.

## M2 — Clip quality

| Spec | Part |
|---|---|
| SPEC-080 | Face-tracked reframe, fit-with-blur, split layout |
| SPEC-090 | Word-by-word highlighted captions, style presets |
| SPEC-070 | Scene-cut and silence nudging polish |

**Exit check:** side by side with the M1 output, M2 clips look clearly better on all fixtures.

## M3 — Desktop app

| Spec | Part |
|---|---|
| SPEC-120 | Job queue in SQLite, worker in `utilityProcess`, resume after crash |
| SPEC-130 | IPC contract for projects, jobs, clips, settings |
| SPEC-140 | Projects list, new project, job progress |
| SPEC-155 | Settings: providers, test connection, hardware profile |

**Exit check:** someone who never used the CLI can make clips from a 1-hour video in the app.

## M4 — Review editor

| Spec | Part |
|---|---|
| SPEC-150 | Clip list, player, word-snapped trim, caption editing, re-render one clip, export |

## M5 — Ship

| Spec | Part |
|---|---|
| SPEC-170 | Installer, bundled binaries and fonts, licenses, auto-update |
| SPEC-155 | Onboarding: hardware check, model downloads |
| SPEC-190 | URL import with rights confirmation |

**Exit check:** a clean Windows PC installs the app and makes clips with no manual setup.

## M6 — Validate with creators

Not a spec yet. 15+ creators (5 per language) use it for 4 weeks. Measure the post rate per
language, ask about price, decide on pricing and on a Bangla/Hindi UI.
