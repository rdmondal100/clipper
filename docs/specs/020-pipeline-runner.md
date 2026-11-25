# SPEC-020: Pipeline runner and stage contract

| | |
|---|---|
| **Status** | Ready |
| **Milestone** | M0 |
| **Depends on** | SPEC-010, ADR-0002 |
| **Code** | `src/main/pipeline/stage.ts`, `runner.ts`, `runner.test.ts` |

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
  settingsKey: (project: Project) => unknown; // only the settings that affect this stage
  run: (ctx: StageContext, clipId?: string) => Promise<{ outputs: string[] }>;
};
```

Stages are created by factories that receive their dependencies:
`createTranscribeStage({ bins, transcriber })`. Tests pass fakes.

## Rules

- R1. Fixed order: ingest, transcribe, segment, highlights, snap, reframe, captions, render.
- R2. `inputHash(stage) = sha256(JSON of { stage.version, stage.settingsKey(project), inputHash(previous stage) })`.
  Ingest's "previous" is the source fingerprint (path, size, mtime). Changing anything upstream
  therefore invalidates everything downstream without hashing big files.
- R3. A stage is skipped when its manifest record has the same `inputHash` and all its outputs exist.
- R4. `run(projectDir, { from?, to?, force?, clipIds?, signal, onProgress })`:
  `to` stops after a stage (CLI `--to transcribe`), `force` reruns named stages, `clipIds` limits
  per-clip stages to those clips.
- R5. On error the runner stops, writes no record for the failed stage, and returns
  `{ ok: false, stage, message }`. Earlier records stay, so the next run resumes there.
- R6. On abort: child processes are killed (via `signal`), the runner returns
  `{ ok: false, cancelled: true }` and deletes `.tmp` files.
- R7. Overall progress = weighted sum of stage progress. Starting weights (tune in M1):
  ingest 5, transcribe 35, segment 1, highlights 15, snap 1, reframe 13, captions 2, render 28.
  Skipped stages count as complete. Progress never goes backwards.
- R8. Progress callbacks are throttled to at most 4 per second.
- R9. Each run writes a log file `logs/job-<jobId>.log`. Never log API keys. Transcript text only
  at debug level.

## Language notes

The project language is part of `settingsKey` for transcribe, segment, highlights and captions.

## Acceptance criteria

All with fake stages:

- [ ] A second run with nothing changed skips every stage.
- [ ] Changing a setting used by `segment` reruns segment and every later stage, not earlier ones.
- [ ] A stage that throws stops the run; the next run starts at that stage.
- [ ] Aborting during a stage returns `cancelled: true` and the stage's `signal` is aborted.
- [ ] `to: "transcribe"` runs ingest and transcribe only.
- [ ] `clipIds: ["c02"]` reruns per-clip stages for c02 only.
- [ ] Reported progress is monotonic from 0 to 1.
- [ ] Bumping a stage `version` reruns it.

## Test plan

`src/main/pipeline/runner.test.ts` with in-memory fake stages and a temp project folder.
