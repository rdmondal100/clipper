# SPEC-020: Pipeline runner and stage contract

| | |
|---|---|
| **Status** | Done |
| **Milestone** | M0 |
| **Depends on** | SPEC-010, ADR-0002 |
| **Code** | `src/main/pipeline/stage.ts`, `runner.ts`, `progress.ts`, `jobLog.ts`, `runner.test.ts` |

## Goal

One small runner executes stages in order, skips work that is already done, resumes after crashes,
reports progress, and can be cancelled. Every stage implements the same contract, so each one can
be built and tested alone.

## Non-goals

Parallel stages. Distributed processing. A plugin system.

## The contract

```ts
type StageName = "ingest" | "transcribe" | "segment" | "highlights" | "snap" | "reframe" | "captions" | "render";

type StageContext = {
  dir: ProjectPaths;               // typed path helpers for the project folder (SPEC-010)
  project: Project;                // parsed project.json
  signal: AbortSignal;             // pass to every child process and fetch
  progress: (fraction: number, note?: string) => void; // 0..1 within this stage
  log: Logger;
};

type Stage = {
  name: StageName;
  version: number;                         // bump when output format or logic changes
  perClip: boolean;                        // reframe, captions, render
  readsSource: boolean;                    // ingest, render: refuse to run while the source is missing (R11)
  settingsKey: (project: Project) => unknown; // only the settings that affect this stage
  run: (ctx: StageContext, clipId?: string) => Promise<{ outputs: string[] }>;
};

type RunOptions = {
  from?: StageName; to?: StageName; force?: StageName[]; clipIds?: string[];
  jobId?: string;                          // names the log file; generated when omitted (CLI)
  signal: AbortSignal;
  onProgress?: (u: { stage: StageName; clipId?: string; stageProgress: number; overall: number; note?: string }) => void;
};

type StageRef = { stage: StageName; clipId?: string };
type RunResult =
  | { ok: true; jobId: string; ran: StageRef[]; skipped: StageRef[] }
  | { ok: false; cancelled?: false; jobId: string; stage: StageName; clipId?: string; message: string; sourceMissing?: true }
  | { ok: false; cancelled: true; jobId: string };
```

Stages are created by factories that receive their dependencies:
`createTranscribeStage({ bins, transcriber })`. Tests pass fakes. `run` may return outputs as
absolute paths inside the project folder (e.g. from `ProjectPaths`) or relative ones; the runner
records them relative, with `/`.

## Rules

- R1. Fixed order: ingest, transcribe, segment, highlights, snap, reframe, captions, render.
  `createRunner` throws if the stages it is given are out of that order, repeated, or if a
  whole-project stage comes after a per-clip one. Unregistered stages are simply absent (M0 has none).
- R2. `inputHash(stage) = sha256(JSON of { stage.version, stage.settingsKey(project), inputHash(previous stage) })`.
  Ingest's "previous" is the source fingerprint (path, size, mtime). Changing anything upstream
  therefore invalidates everything downstream without hashing big files. "Previous" is the previous
  *registered* stage. JSON keys are sorted, so key order in `settingsKey` doesn't matter.
  Per-clip stages chain per clip, and their hash also includes the clip id and that clip's entry in
  `clips.json`, so editing one clip (SPEC-150) reruns only that clip's per-clip stages.
- R3. A stage is skipped when its manifest record has the same `inputHash` and all its outputs exist.
  Before a stage runs, its own record and the records of every later stage are removed (for a
  per-clip stage: that clip's later records only). So a forced, retried or interrupted stage never
  leaves stale cached results downstream, even after a crash.
- R4. `run(projectDir, { from?, to?, force?, clipIds?, jobId?, signal, onProgress })`:
  `to` stops after a stage (CLI `--to transcribe`), `force` reruns named stages, `from` reruns that
  stage and everything after it, `clipIds` limits per-clip stages to those clips. `from` and `to`
  are positions in the R1 order, so they work even when that stage isn't registered yet.
  Whole-project stages still run (or skip) normally when `clipIds` is given.
- R5. On error the runner stops, writes no record for the failed stage, and returns
  `{ ok: false, stage, message }`. Earlier records stay, so the next run resumes there.
- R6. On abort: child processes are killed (via `signal`), the runner returns
  `{ ok: false, cancelled: true }` and deletes `.tmp` files. A stage that already resolved when the
  abort lands is still recorded (its work is complete).
- R7. Overall progress = weighted sum of stage progress. Starting weights (tune in M1):
  ingest 5, transcribe 35, segment 1, highlights 15, snap 1, reframe 13, captions 2, render 28.
  Skipped stages count as complete. Progress never goes backwards. Only registered stages up to
  `to` count, so a `--to transcribe` run also ends at 1. A per-clip stage's weight is split evenly
  across the clips being processed.
- R8. Progress callbacks are throttled to at most 4 per second. The first update (0) and the final
  one (1) always go out.
- R9. Each run writes a log file `logs/job-<jobId>.log` (info and above; debug only goes to the
  injected logger, so a log attached to a bug report holds no transcript text). Never log API keys
  or full user paths. Transcript text only at debug level.
- R10. Per-clip stages read clip ids from `stages/clips.json` (`ClipsSchema`, SPEC-070) and run clip
  by clip (c01 reframe → captions → render, then c02 …), so the first clip is ready sooner. If
  `clips.json` is missing or invalid, or `clipIds` names a clip that isn't in it, the run fails at
  the first per-clip stage.
- R11. Before running (not skipping) a stage with `readsSource`, the runner calls `checkSource`
  (SPEC-010 R4). If the source is missing or changed it returns
  `{ ok: false, stage, message, sourceMissing: true }` so the app can offer to relink.
- R12. Each run starts by deleting leftover `.tmp` files (SPEC-010 R6).

## Language notes

The project language is part of `settingsKey` for transcribe, segment, highlights and captions.

## Acceptance criteria

All with fake stages:

- [x] A second run with nothing changed skips every stage.
- [x] Changing a setting used by `segment` reruns segment and every later stage, not earlier ones.
- [x] A stage that throws stops the run; the next run starts at that stage.
- [x] Aborting during a stage returns `cancelled: true` and the stage's `signal` is aborted.
- [x] `to: "transcribe"` runs ingest and transcribe only.
- [x] `clipIds: ["c02"]` reruns per-clip stages for c02 only.
- [x] Reported progress is monotonic from 0 to 1.
- [x] Bumping a stage `version` reruns it.
- [x] Forcing a stage reruns it and every later stage, also after a crash between the two (R3).
- [x] A stage with `readsSource` returns `sourceMissing: true` when the source changed; a cached
      one is still skipped (R11).
- [x] Per-clip stages run clip by clip from `clips.json`; editing one clip's entry reruns only that
      clip (R2, R10).
- [x] Progress updates are throttled to at most 4 per second (R8).
- [x] Each run writes `logs/job-<jobId>.log` without debug lines (R9); leftover `.tmp` files are
      removed at the start (R12) and on abort (R6).
- [x] Stages out of order or repeated make `createRunner` throw (R1).

## Test plan

`src/main/pipeline/runner.test.ts` with in-memory fake stages and a temp project folder.

## Implementation notes

API (`src/main/pipeline/`, no Electron):

- `createRunner({ stages, log, now? })` → `{ run(projectDir, options) }`. `createRunner` throws on a
  bad stage order (R1). `run` returns a `RunResult` for everything that happens during a run and
  only throws when `projectDir` isn't a project (`readProject`: a caller bug, not a stage failure).
- `stage.ts` holds the contract plus `STAGE_ORDER`, `STAGE_WEIGHTS`, `stageIndex` and `StageRef`;
  `progress.ts` holds weighting/throttling (R7, R8); `jobLog.ts` holds the job log file (R9).
- `missingOutputs` is now exported from `project/manifest.ts` (the R3 "all outputs exist" check).

Decisions and gotchas:

- **Hash:** sha256 of JSON with sorted keys of `{ version, settings: settingsKey(project) ?? null,
  previous, clip? }`. The source fingerprint is `{ path, sizeBytes, mtimeMs }` from `project.json`,
  so a source edited in place doesn't change it; R11's `checkSource` catches that instead.
- **Per-clip hash** includes the whole `clips.json` entry, so a title-only edit (SPEC-150) also reruns
  reframe and captions. That's safe but wasteful; narrow it in SPEC-150 if reframe gets slow.
- **R3 record removal** writes the manifest *before* the stage starts. That is what makes
  `force` safe across a crash. Without it, a forced segment followed by a crash would leave
  highlights' old record valid, because its `inputHash` doesn't change.
- `force` + `clipIds` forces only those clips. `from`/`to` compare positions in `STAGE_ORDER`, so
  `--to transcribe` already works while transcribe isn't registered.
- Outputs: absolute paths inside the project are stored relative with `/`. A path outside the
  project, or one that wasn't written, fails the stage (the latter via `recordStage`).
- `readsSource` is checked only when a stage is about to *run*. A cached ingest still skips with a
  missing source, so highlights/captions can be redone without the video.
- **Cancel** waits for the running stage to settle. It does not race it, so cleanup never overlaps
  a stage still writing. A stage that ignores `signal` therefore blocks cancel, so SPEC-120's
  "cancel within 2 s" depends on every stage passing `signal` to its child processes and fetches.
- **Progress:** every unit reports 0 at start and 1 at completion (throttled). The first update and
  a final `overall: 1` always go out. Calls after a stage settles are ignored, and NaN counts as 0.
  Per-clip weights are split over the clips selected for this run; with zero clips those stages
  count as complete.
- **Job log:** append mode, so a job resumed under the same id (SPEC-120) keeps one file. It holds
  info and above only. The project folder and source path are replaced with `<project>` /
  `<source>`, because stage errors (e.g. Node `ENOENT`) embed full paths. A log write error only
  warns. The default `jobId` has the project-id shape (`YYYYMMDD-HHmmss-xxxxxx`).
- `.tmp` files are removed at start (R12) and on cancel (R6), but not after a failure: the next
  start removes them.
- Not handled: two runs on the same project at once (SPEC-120 runs one job at a time; the CLI and
  the app on the same project are not guarded). API keys never reach the runner today; when
  SPEC-110 passes them, add them to the job log's `redact` map.
- `scripts/clip.ts` creates or opens the project before calling `run` (SPEC-160).
- No new dependencies.
