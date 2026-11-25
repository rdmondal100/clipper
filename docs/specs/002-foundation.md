# SPEC-002: Repo foundation

| | |
|---|---|
| **Status** | Done |
| **Milestone** | M0 |
| **Depends on** | ADR-0001, ADR-0002 |
| **Code** | `apps/electron/*` config, `src/main/index.ts`, `src/main/ipc.ts`, `src/main/utils/*`, `src/preload/index.ts` |

## Goal

A clean, installable skeleton with the same conventions as the WorkPulse agent: the app opens an
empty window, typed IPC works end to end, tests and typecheck run, and the guard rails exist.

## Non-goals

Any real feature. No database yet (SPEC-120), no AI packages yet (SPEC-110).

## What the starter already contains

- Config files adapted from WorkPulse: `electron.vite.config.ts` (with a second main entry for the
  job worker), `tsconfig*.json`, `vitest.config.ts`, `components.json`, `electron-builder.json`.
- Typed IPC plumbing copied from WorkPulse (`utils/ipc.ts`, preload `ipcInvoke`/`ipcOn`), with one
  channel: `app:get-info`.
- Secure window defaults (`window/shared.ts`): sandbox, context isolation, no navigation away.
- Stub folders for every feature with an `index.ts` that points at its spec. Pipeline stages are
  factories (`createSegmentStage()` …) that throw "Not implemented: see docs/specs/…".
- `src/shared/schemas.ts`: Zod schemas for every project file (project, manifest, probe, loudness,
  transcript, segments, candidates, clips, presets) and the LLM responses — the contracts later
  specs build against.
- `src/main/pipeline/stage.ts` (Stage contract, order, weights), `runner.ts` (signature only),
  `project/paths.ts` (every project file path), `ai/types.ts` (`StructuredAI`, `Transcriber`,
  provider configs), `media/index.ts` (`Bins`).
- `src/main/pipeline/noElectron.test.ts`, the ADR-0002 guard (covers `pipeline/`, `ai/`, `media/`).
- `src/shared/languages.ts` + tests (SPEC-001 reference implementation).
- `scripts/check-bins.mjs` (SPEC-170 M0, working) and `scripts/clip.ts` (SPEC-160: argument
  parsing and validation work; the run itself waits for SPEC-010/020).
- A placeholder `resources/icon.png` and `resources/presets.json` (limits unverified).

## Rules

- R1. Pure-JS libraries go in `devDependencies` so Vite bundles them (same as WorkPulse). Native
  modules (only `better-sqlite3`, from SPEC-120) go in `dependencies`, stay external, and are listed
  in `asarUnpack`.
- R2. Each later spec installs its own packages and says why in its implementation notes:
  M1 adds `ai`, provider packages and `execa`; M2 adds `@mediapipe/tasks-vision`;
  M3 adds `better-sqlite3`, `drizzle-orm`, `drizzle-kit`, `@electron/rebuild`.
- R3. Pin exact versions in the lockfile; commit `package-lock.json`.
- R4. Large files are never committed: `node_modules/`, `out/`, `release/`, `resources/bin/`,
  `resources/models/`, fixture videos. Golden JSON outputs in `fixtures/` *are* committed.
- R5. Scripts in `apps/electron/package.json`: `postinstall`, `dev`, `build`, `preview`, `dist:win`,
  `typecheck`, `test`, `clip`, `check:bins`. `postinstall` runs `install-electron` so the Electron
  binary is present before `dev`/`preview` (see implementation notes).

## Acceptance criteria

- [x] `npm install` succeeds on Windows with Node 22+.
- [x] `npm run typecheck` passes.
- [x] `npm test` passes (languages tests + guard test).
- [x] `npm run dev` opens a window titled "Clipper" that shows the app version and "dev mode",
      read through `window.clipper.getInfo()`.
- [x] Adding `import { app } from "electron"` to any file under `src/main/pipeline/`,
      `src/main/ai/` or `src/main/media/` makes
      `npm test` fail with a message naming the file. (Check once by hand, then remove it.)
- [x] `npm run build` produces `out/main/index.js`, `out/main/worker.js`, `out/preload/index.cjs`,
      `out/renderer/index.html`.

## Test plan

- `src/main/pipeline/noElectron.test.ts`
- `src/shared/languages.test.ts`
- Manual: `npm run dev`, `npm run build`.

## Implementation notes

- The starter was generated without `npm install` (no network), so versions in `package.json` are
  copied from the WorkPulse agent plus `zod` and `tsx`. The first session should run install,
  typecheck, test and `npm run dev`, and fix any version drift.
- Checked when the starter was made: the Electron-free code (`src/shared`, `pipeline/`, `ai/`,
  `media/`, `scripts/clip.ts`) typechecks against Zod 4; the 19 language tests pass; the guard test
  fails when an `electron` import is added to `pipeline/` and passes when it's removed;
  `check:bins` exits 2 with hints when nothing is installed; `clip` exits 2 on a missing or unknown
  language. Not checked: Electron main/preload/renderer files (need `npm install`).

### First install (2026-11-25, Windows 11, Node 26.13.0, npm 11.20.0)

- **No version drift.** Every range in `package.json` resolved without changes. Resolved:
  electron 45.2.2, electron-vite 6.0.0, vite 8.3.8, vitest 5.1.1, typescript 7.0.2, zod 4.6.7,
  react 19.3.1, tailwindcss 4.3.5, @vitejs/plugin-react 6.3.0, electron-builder 26.18.0,
  tsx 4.23.15, shadcn 4.23.0, lucide-react 1.80.0, zustand 5.1.0.
- **Workspaces:** the root `package.json` declares `apps/*`, so `npm install` (from the root or
  from `apps/electron`) puts `node_modules/` and `package-lock.json` at the **repo root**. That
  root lockfile is the one to commit (R3).
- **Electron binary (the one real fix):** Electron 45 no longer downloads its binary at install
  time; it downloads lazily the first time `require("electron")` runs. electron-vite 6.0.0 (latest)
  doesn't use that path: it reads `node_modules/electron/path.txt` directly and fails with
  `Error: Electron uninstall` when it's missing. Fix: `"postinstall": "install-electron"`
  (Electron's own bin, its `install.js`), which writes `dist/` and `path.txt` and exits early if
  they're already there. No new dependency. Can be removed once electron-vite handles lazy installs.
- **npm 11 `allowScripts`:** npm skips dependency install scripts that aren't approved. Our own
  workspace `postinstall` still runs. The two skipped ones aren't needed: `esbuild` gets its
  binary from the `@esbuild/win32-x64` optional dependency (build works), and
  `electron-winstaller` is only for Squirrel installers (we build NSIS). Don't approve them
  unless something breaks.
- **electron-vite targets:** its Node/Chrome target tables stop at Electron 44, so for 45 it falls
  back to 44's targets (node24.18 / chrome152). Harmless (slightly conservative output).
- **`npm audit`: 9 moderate**, all one `minimatch` DoS advisory reached only through build-time
  tools (`electron-builder`, the `shadcn` CLI). Nothing ships in the app. The suggested fix is a
  major downgrade (electron-builder 25, shadcn 1), so it is not applied.
- **Guard check:** added an `electron` import to `pipeline/segment/`, `ai/` and `media/` at once;
  the test failed listing all three files (nested folders are scanned), then passed after removal.
- **Dev window:** title "Clipper", shows "Version 0.1.0 · dev mode" (the line shows "…" until
  `getInfo()` answers), বাংলা/हिन्दी render correctly in Nirmala UI, follows the Windows dark theme.
  No errors in the dev log.
