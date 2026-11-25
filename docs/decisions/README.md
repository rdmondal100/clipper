# Decisions (ADRs)

Short records of choices we don't want to re-argue. To change one, add a new ADR that
supersedes it; don't edit the old one's decision.

| ADR | Decision | Status |
|---|---|---|
| [0001](0001-electron-same-layout-as-workpulse.md) | Electron + electron-vite, same layout as the WorkPulse agent | Accepted |
| [0002](0002-pipeline-never-imports-electron.md) | The pipeline never imports Electron | Accepted |
| [0003](0003-llm-returns-segment-ids.md) | The LLM returns segment IDs, never timestamps | Accepted |
| [0004](0004-three-languages.md) | Three languages (bn, en, hi), one per project | Accepted |
| [0005](0005-files-plus-sqlite.md) | Project folders + SQLite, no server | Accepted |
| [0006](0006-ffmpeg-licensing.md) | FFmpeg build and licence | Open — decide before M5 |
| 0007 | Default models per language | To be written in M1.5 (SPEC-180) |

Template:

```md
# ADR-NNNN: Title
Status: Proposed | Accepted | Superseded by ADR-XXXX
Date: YYYY-MM-DD

## Context
## Decision
## Consequences
```
