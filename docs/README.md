# Docs

Everything the app does is described here before it is built. Code follows the docs, not the
other way round.

| Folder | What's inside | Who changes it |
|---|---|---|
| `product/` | Why we build this, for whom, and in what order | You (the product owner) |
| `specs/` | One spec per feature: rules, data, acceptance criteria | You + the agent, before coding |
| `decisions/` | ADRs: decisions we don't want to argue about again | Anyone, by adding a new ADR |
| `architecture.md` | How the processes and folders fit together | Update when a spec changes the shape |
| `glossary.md` | Words with one fixed meaning in this project | Anyone |

## The workflow

```
roadmap.md ──► pick next spec with status Ready
                    │
                    ▼
        read spec + its "Depends on"
                    │
     unclear? ──────┼──────► fix the spec first (status stays Draft until clear)
                    ▼
     write tests from the acceptance criteria (they fail)
                    ▼
     implement until `npm run typecheck && npm test` pass
                    ▼
     tick boxes, status = Done, add Implementation notes, update roadmap
```

### Spec status

| Status | Meaning |
|---|---|
| `Draft` | Direction is set, details are missing. Refine before building. |
| `Ready` | Clear enough to build. Acceptance criteria are testable. |
| `In progress` | Someone is building it. |
| `Done` | Built, tests pass, boxes ticked. |
| `Superseded` | Replaced by another spec (link it). |

### Prompting the agent

Good, token-efficient prompts point at one spec:

> Implement SPEC-050 (segment). Follow CLAUDE.md. Write the tests from the acceptance criteria
> first. Don't touch other specs' code.

> Review SPEC-060 against SPEC-001 and SPEC-050. List contradictions and missing cases. Don't
> write code.

One spec per session keeps the context small and the result reviewable.

## Spec index

| ID | Title | Milestone | Status |
|---|---|---|---|
| [SPEC-001](specs/001-languages.md) | Languages: Bangla, English, Hindi | M0–M2 | Ready |
| [SPEC-002](specs/002-foundation.md) | Repo foundation | M0 | Done |
| [SPEC-010](specs/010-project-storage.md) | Project folders and cache | M0 | Ready |
| [SPEC-020](specs/020-pipeline-runner.md) | Pipeline runner and stage contract | M0 | Ready |
| [SPEC-030](specs/030-ingest.md) | Ingest | M1 | Ready |
| [SPEC-040](specs/040-transcribe.md) | Transcribe | M1 | Ready |
| [SPEC-050](specs/050-segment.md) | Segment into sentences | M1 | Ready |
| [SPEC-060](specs/060-highlights.md) | Find highlights with an LLM | M1 | Ready |
| [SPEC-070](specs/070-snap.md) | Snap clip edges | M1 | Ready |
| [SPEC-080](specs/080-reframe.md) | Reframe to 9:16 | M2 | Draft |
| [SPEC-090](specs/090-captions.md) | Captions | M1–M2 | Ready |
| [SPEC-100](specs/100-render.md) | Render and platform presets | M1 | Ready |
| [SPEC-110](specs/110-ai-providers.md) | AI providers and API keys | M1 | Ready |
| [SPEC-120](specs/120-jobs-worker.md) | Job queue and worker | M3 | Draft |
| [SPEC-130](specs/130-ipc-contract.md) | IPC contract | M3 | Draft |
| [SPEC-140](specs/140-app-ui.md) | App UI: projects, new project, progress | M3 | Draft |
| [SPEC-150](specs/150-review-editor.md) | Review editor | M4 | Draft |
| [SPEC-155](specs/155-settings-onboarding.md) | Settings, hardware profiles, onboarding | M3–M5 | Draft |
| [SPEC-160](specs/160-cli.md) | Headless CLI | M0–M1 | Ready |
| [SPEC-170](specs/170-binaries-packaging.md) | Binaries, fonts and packaging | M0, M5 | Ready (M0 part) |
| [SPEC-180](specs/180-language-quality-gate.md) | Language quality gate | M1.5 | Ready |
| [SPEC-190](specs/190-url-import.md) | URL import and rights | M5 | Draft |
