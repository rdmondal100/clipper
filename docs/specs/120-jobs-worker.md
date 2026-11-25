# SPEC-120: Job queue and worker

| | |
|---|---|
| **Status** | Draft |
| **Milestone** | M3 |
| **Depends on** | SPEC-020, SPEC-110, ADR-0005 |
| **Code** | `src/main/jobs/` (`queue.ts`, `worker.ts`, `index.ts`), `src/main/db/` |

## Goal

Run pipeline jobs outside the main process, one at a time, surviving crashes and restarts, with
live progress in the UI.

## Design (to refine)

- **Database** (better-sqlite3 + Drizzle, `<userData>/clipper.db`):
  - `projects(id, name, dir, language, sourcePath, createdAt, status)`
  - `jobs(id, projectId, kind: "full" | "rerender", clipIds, status, stage, progress, error, createdAt, startedAt, finishedAt)`
  - `clips(id, projectId, title, start, end, total, status, edited, exportedAt)`
  - `settings(key, value)` — JSON values; keys are never here (SPEC-110)
- **Statuses:** `queued → running → done | failed | cancelled`. On app start, `running` jobs become
  `queued` again (the runner resumes from the manifest, SPEC-020).
- **Worker:** `utilityProcess.fork(out/main/worker.js)`. Main sends
  `{ type: "start", job, project, providers, keys, bins, folders }`; the worker replies with
  `progress`, `stage-done`, `log`, `done`, `error`. `cancel` aborts the runner's signal.
- One job at a time. Re-render jobs for single clips (SPEC-150) jump ahead of full jobs.
- While a job runs: `powerSaveBlocker.start("prevent-app-suspension")`; a Windows notification when
  it finishes if the window isn't focused.
- Progress is pushed to the renderer on `job:progress` (throttled, SPEC-020 R8).

## Open questions

- Worker crash (native crash in ffmpeg won't kill the worker, but OOM might): auto-restart once?
- Should the queue allow two light jobs in parallel (e.g. highlights for one project while another
  renders)? Probably not in v1.

## Acceptance criteria (to finalize)

- [ ] Killing the app mid-job and reopening resumes the job from the last finished stage.
- [ ] Cancel stops ffmpeg/whisper within 2 s.
- [ ] The UI stays responsive (no main-thread task > 50 ms) during a render.
