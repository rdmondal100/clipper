# Architecture

## Processes

```
┌──────────────────────────── Renderer (React, sandboxed) ────────────────────────────┐
│ pages/ components/ store/ hooks/   ── window.clipper (preload bridge) ──┐            │
└──────────────────────────────────────────────────────────────────────────┼───────────┘
                                                                           │ typed IPC
┌──────────────────────────── Main process (Electron) ─────────────────────▼───────────┐
│ ipc.ts → projects/ settings/ jobs/ ai/ hardware/ window/ protocol.ts (media://)      │
│ owns state, keys (safeStorage), SQLite (db/)                                         │
└───────────────┬───────────────────────────────────────────────┬──────────────────────┘
                │ MessagePort                                    │ IPC
┌───────────────▼──────── Job worker (utilityProcess) ──┐  ┌─────▼───── Face worker ─────┐
│ jobs/worker.ts → pipeline/ (no electron imports)       │  │ hidden window #face-worker  │
│ runs stages, writes project files, reports progress    │  │ MediaPipe face detection    │
└───────────────┬────────────────────────────────────────┘  └─────────────────────────────┘
                │ spawn (execa)
   ffmpeg · ffprobe · whisper-cli · yt-dlp   (+ HTTP to Ollama / cloud AI)
```

- **Renderer** shows state and sends requests. No Node, no file paths beyond what main gives it.
  Plays videos through the `media://` protocol (SPEC-130).
- **Main** owns all state, settings, keys and the database. It starts jobs but never does heavy
  work itself, so the window never freezes.
- **Job worker** runs the pipeline. One job at a time by default (video work saturates CPU/GPU).
- **Face worker** is a hidden window because MediaPipe needs a browser (WebGL/WASM). The pipeline
  asks for face data through main (SPEC-080).
- **Pipeline** is plain Node + child processes. The same code runs in the worker, in Vitest, and in
  the CLI (`scripts/clip.ts`).

## Pipeline

```
ingest → transcribe → segment → highlights → snap → reframe → captions → render
  030       040         050        060         070      080        090        100
```

Each stage reads files from the project folder and writes one output file (SPEC-010, SPEC-020).
A stage reruns only when its inputs, its settings or its version change. Everything downstream
of a rerun stage reruns too.

## Data

- **Project folder** (`Documents/Clipper/Projects/<id>/`): all media and JSON produced by stages.
  Survives uninstalling the app. Schemas in `src/shared/schemas.ts`.
- **SQLite** (`<userData>/clipper.db`): list of projects, jobs, clips, settings. Small, rebuildable
  from project folders if lost.
- **Keys**: `safeStorage`-encrypted file in userData, read only by main.

## Languages

A single registry (`src/shared/languages.ts`, SPEC-001) holds every per-language value: Whisper
code, script ranges, sentence terminators, fonts, caption line limits, token estimates, prompt
hints. Stages ask the registry; they never branch on language codes themselves.
