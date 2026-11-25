# SPEC-010: Project folders and cache

| | |
|---|---|
| **Status** | Done (pipeline side). The Electron side (R10 trash, relink, list) comes in M3 |
| **Milestone** | M0 (pipeline side), M3 (Electron side) |
| **Depends on** | ADR-0005, SPEC-001 |
| **Code** | `src/main/pipeline/project/` (no Electron), `src/main/projects/` (Electron side: list, trash, relink — built in M3 with SPEC-130's `project:delete` / `project:relink`) |

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

- [x] `createProject({ root, sourcePath, language, settings })` creates the layout and a valid
      `project.json`; the id matches `^\d{8}-\d{6}-[a-z0-9]{6}$`.
- [x] A source path containing Bangla and Hindi characters works end to end through `createProject`.
- [x] `writeJsonAtomic` never leaves a partially written target file (test by killing the write
      between tmp write and rename with an injected fs).
- [x] Manifest round-trips through its schema; an invalid manifest is treated as empty with a warning.
- [x] `checkSource` reports `sourceMissing` when size or mtime changes.
- [x] Free-space estimate warns when free space is below the estimate (fs injected).

M3 (Electron side, with SPEC-130):

- [ ] Deleting a project moves its folder to the Recycle Bin (R10).
- [ ] Relinking a moved source updates `project.json` and clears `sourceMissing`.

## Test plan

`src/main/pipeline/project/*.test.ts` with a temp directory per test (`fs.mkdtemp`).

## Open questions

- Should exports go to a user-chosen folder instead of inside the project? (Proposal: inside the
  project, plus an "Export to…" action in SPEC-150.)

## Implementation notes

API (`src/main/pipeline/project/index.ts`, no Electron):

- `createProject({ root, sourcePath, language, settings, name?, copySource?, now? })` →
  `{ project, paths }`. Writes `project.json` and an empty `manifest.json`, makes `media/`,
  `stages/`, `exports/`, `logs/`. `readProject(dir, log)` throws if `project.json` is missing or
  invalid (it isn't a cache, so it can't be rebuilt).
- `writeJsonAtomic(path, data, { fs? })`, `readJsonFile(path, schema, log)` (R5: missing or invalid
  → `undefined`, invalid also warns), `removeTmpFiles(dir)` (R6, for the runner at job start).
- `readManifest(paths, log)`, `writeManifest`, `emptyManifest`, and
  `recordStage(paths, { stage, record, clipId? }, log)` which enforces R8 (every output must exist)
  and R7 (with `clipId` the record goes under `clips[clipId][stage]`). Outputs must be relative to
  the project folder.
- `checkSource(paths, project)` → `{ ok: true } | { ok: false, status: "sourceMissing", reason: "missing" | "changed" }`
  and `sourceFilePath(paths, project)` (what ingest should read). Nothing calls `checkSource` yet:
  SPEC-020/030 must decide whether the runner or the ingest stage refuses to run on
  `sourceMissing` (neither spec says so today).
- `checkFreeSpace(dir, durationSec, { statfs? })` → `{ enough, freeBytes, neededBytes }`, with
  `estimateNeededBytes`. "GB" is GiB (1024³, like Explorer). Needs the duration, so the caller runs
  it once the probe is known (SPEC-030 / SPEC-140).

Gotchas and decisions:

- **Source paths are stored exactly as given, never NFC-normalized.** NTFS doesn't normalize
  names, and some Bangla/Hindi letters change under NFC (য় U+09DF, क़ U+0958 are composition
  exclusions and become two code points), so a normalized path can stop naming the file. Only the
  display `name` is NFC (`normalizeText`). The tests use exactly those letters.
- **Copied source (R3):** copied to `media/source.<ext>` (lower-case ASCII ext, else `video`) and
  `source.path` is stored *relative* (`media/source.mp4`), so a copied project survives being
  moved; size/mtime are the copy's. The copy has no progress or cancel yet; add them when the
  setting gets a UI (SPEC-155).
- **Atomic writes:** `<file>.tmp` written with `flush: true` (fsync) then renamed, so even a power
  cut can't leave an empty target. Windows rename sometimes fails with `EPERM`/`EACCES`/`EBUSY`
  while antivirus or the indexer holds the file; it is retried 5 times (50–800 ms backoff, ~1.5 s).
  On failure the `.tmp` is removed; after a real crash it stays until `removeTmpFiles`.
- `readJsonFile` strips a UTF-8 BOM (Notepad adds one when someone edits a project file by hand).
- The project id uses the local clock (it's what the user sees when browsing the folder). The
  project folder is created without `recursive`, so an existing folder is never reused; if any
  later step fails, the half-made folder is removed.
- `checkSource` treats any `stat` failure (unplugged drive, offline share) as `missing`, and
  compares `mtimeMs` exactly (JSON round-trips the double without loss).
- Logs name files by base name only, not full paths.
- No new dependencies.
