# SPEC-010: Project folders and cache

| | |
|---|---|
| **Status** | Ready |
| **Milestone** | M0 |
| **Depends on** | ADR-0005, SPEC-001 |
| **Code** | `src/main/pipeline/project/` (no Electron), `src/main/projects/` (Electron side: list, trash, relink) |

## Goal

Every project is a self-contained folder. Stages read and write files there, so a job can resume
after a crash, the CLI and the app share the same data, and nothing depends on the database to
produce clips.

## Non-goals

The database (SPEC-120). Cloud sync. Sharing projects between computers.

## Layout

```
<projectsRoot>/<projectId>/
  project.json            ProjectSchema: settings chosen when the project was created
  manifest.json           ManifestSchema: which stages finished, with which inputs
  media/
    probe.json            from SPEC-030
    audio_16k.wav
    proxy_480p.mp4
    loudness.json
  stages/
    transcript.json       SPEC-040 (chunks in stages/transcribe-chunks/NN.json)
    segments.json         SPEC-050
    candidates.json       SPEC-060
    clips.json            SPEC-070
    faces/<clipId>.json   SPEC-080
    reframe/<clipId>.json SPEC-080
    captions/<clipId>.ass SPEC-090
  exports/
    <clipId>_<presetId>.mp4
    <clipId>_<presetId>.jpg
    <clipId>.meta.json
  logs/
    job-<jobId>.log
```

## Rules

- R1. `projectsRoot` defaults to `Documents/Clipper/Projects`, is changeable in settings, and is
  never inside appData (uninstall must not delete user work).
- R2. `projectId` is ASCII only: `YYYYMMDD-HHmmss-<6 random [a-z0-9]>`. All files inside a project
  have fixed ASCII names. (Some Windows CLI tools mishandle non-ASCII paths; only the source path
  may contain Bangla/Hindi characters.)
- R3. The source video is referenced, not copied: `project.json` stores its absolute path, size and
  mtime. A setting "Copy source into project" copies it to `media/source.<ext>` instead.
- R4. If the source is missing or its size/mtime changed, the project is marked `sourceMissing`
  and stages that read the source refuse to run until the user relinks it.
- R5. Every JSON file has `schemaVersion` and is parsed with its Zod schema. A file that fails
  parsing is treated as missing (the stage reruns) and a warning is logged.
- R6. All writes are atomic: write `<file>.tmp`, then rename. Leftover `.tmp` files are deleted when
  a job starts.
- R7. `manifest.json` records, per stage: `version`, `inputHash`, `outputs` (relative paths),
  `completedAt`, `durationMs`. Per-clip stages (reframe, captions, render) record per clip under
  `clips[clipId][stage]`, so one clip can be re-rendered alone (SPEC-150).
- R8. A record is written only after all its output files exist.
- R9. Before ingest, check free disk space on the projects drive (`fs.statfs`). Estimate need as
  `durationHours × 0.5 GB + 1 GB`. Below that: warn and let the user continue or cancel.
- R10. Deleting a project moves the folder to the Recycle Bin (`shell.trashItem`, main process only).

## Language notes

- `project.json` stores `language: "bn" | "en" | "hi"`. Changing it later invalidates transcribe
  and everything after it (it's part of their input hash).
- Source file names may be in Bangla or Hindi; they are shown in the UI as-is (NFC normalized).

## Acceptance criteria

- [ ] `createProject({ root, sourcePath, language, settings })` creates the layout and a valid
      `project.json`; the id matches `^\d{8}-\d{6}-[a-z0-9]{6}$`.
- [ ] A source path containing Bangla and Hindi characters works end to end through `createProject`.
- [ ] `writeJsonAtomic` never leaves a partially written target file (test by killing the write
      between tmp write and rename with an injected fs).
- [ ] Manifest round-trips through its schema; an invalid manifest is treated as empty with a warning.
- [ ] `checkSource` reports `sourceMissing` when size or mtime changes.
- [ ] Free-space estimate warns when free space is below the estimate (fs injected).

## Test plan

`src/main/pipeline/project/*.test.ts` with a temp directory per test (`fs.mkdtemp`).

## Open questions

- Should exports go to a user-chosen folder instead of inside the project? (Proposal: inside the
  project, plus an "Export to…" action in SPEC-150.)
