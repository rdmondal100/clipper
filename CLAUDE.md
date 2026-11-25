# Clipper — instructions for AI agents

Clipper is a Windows desktop app (Electron) that turns long videos into short vertical clips
(YouTube Shorts, Facebook Reels, Instagram Reels, TikTok). It serves **three languages: Bangla (bn),
English (en) and Hindi (hi)**. AI runs locally (whisper.cpp + Ollama) or through the user's own API key.

## How we work: spec-driven

1. Work only from a spec in `docs/specs/`. Pick the next one from `docs/product/roadmap.md`
   whose status is `Ready`.
2. Read the spec and everything in its "Depends on" line before touching code.
3. If the spec is unclear or wrong, **stop and fix the spec first** (or ask). Code never silently
   disagrees with a spec.
4. Turn each acceptance criterion into a test first, then implement until tests and typecheck pass.
5. When done: tick the acceptance boxes, set status to `Done`, add "Implementation notes" for
   anything the next person needs to know (exact flags, gotchas).
6. A change in behaviour = a spec change in the same commit.

Specs are numbered `SPEC-NNN`. Decisions live in `docs/decisions/` (ADRs). Don't re-open a decided
ADR in code; propose a new ADR instead.

## Commands (run from `apps/electron`)

```bash
npm run dev          # Electron + Vite dev server
npm run typecheck    # main/preload/shared + renderer
npm test             # Vitest (node env, never starts Electron)
npm run clip -- <video> --lang bn   # headless pipeline CLI (SPEC-160)
npm run check:bins   # are ffmpeg/ffprobe/whisper/yt-dlp present? (SPEC-170)
```

Before saying a task is done: `npm run typecheck && npm test` must pass.

## Layout (mirrors the WorkPulse agent)

```
apps/electron/src/
  main/            Electron main process, one folder per feature, each with index.ts
    pipeline/      THE CORE. Never imports "electron". Stages live here.
    ai/ media/ jobs/ projects/ db/ settings/ hardware/ window/ utils/
  preload/         the only bridge: exposes window.clipper
  renderer/src/    React UI: components/ hooks/ lib/ pages/ store/ styles/
  shared/          types.ts (IPC contract), schemas.ts (Zod), languages.ts
```

## Hard rules

- `src/main/pipeline/**`, `src/main/ai/**` and `src/main/media/**` must never import `electron`
  (a test enforces it). Main passes in binary paths, the AI provider, keys and folders. This keeps
  the pipeline runnable from the CLI, the worker and tests.
- Every IPC channel is declared in `src/shared/types.ts` and registered in `src/main/ipc.ts`.
  IPC returns results (`{ ok: true, ... } | { ok: false, message }`), never throws to the renderer.
- Main owns state; the renderer mirrors it (Zustand store + `use*Sync` hook), like WorkPulse.
- Anything from outside our code (LLM output, cached JSON files, ffprobe output) is parsed with a
  Zod schema from `src/shared/schemas.ts` before use.
- The LLM returns **segment IDs, never timestamps** (ADR-0003). Code converts IDs to times.
- API keys never reach the renderer. Store them with Electron `safeStorage` (SPEC-110).
- Never modify the user's source video. Project data lives outside appData (SPEC-010).
- Heavy work runs in the job worker (`utilityProcess`), never in main or the renderer.

## Language rules (SPEC-001 is the source of truth)

- Language codes are exactly `"bn" | "en" | "hi"`. Use the registry in `src/shared/languages.ts`;
  never hard-code per-language values elsewhere.
- Normalize all transcript text to Unicode NFC. Keep ZWJ/ZWNJ (U+200D/U+200C); they matter in Bangla.
- Sentence ends include the danda `।` (U+0964) and double danda `॥` (U+0965), not just `. ? !`.
- Never cut, wrap or style-change inside a word: Bangla/Hindi conjuncts break. Use grapheme-safe
  helpers when truncating.
- Titles, hooks and hashtags are written in the video's language and native script.
- Every language-sensitive feature has tests with bn, en and hi fixtures.

## Code style (match WorkPulse)

- TypeScript strict, ES modules, `verbatimModuleSyntax`, `erasableSyntaxOnly` (no enums, no
  namespaces, no parameter properties).
- Function declarations, named exports collected at the bottom of the file, no default exports.
- Factories with injected dependencies: `createPipeline({ bins, ai, store })`, so tests pass fakes.
- Tests sit next to the code: `thing.ts` + `thing.test.ts`.
- Comments explain *why*, in one short line, like the existing WorkPulse code.
- shadcn/ui for UI primitives (`npx shadcn add <component>`); Tailwind 4; lucide icons.

## Current API notes (your training data may be older)

- Vercel AI SDK: use `generateText({ model, output: Output.object({ schema }) })` and read
  `result.output`. `generateObject` / `streamObject` are deprecated — do not use them.
- Ollama: structured output works with a JSON schema; set the context size explicitly (SPEC-110).
- electron-vite with Vite 8: keep using `build.rollupOptions` as the existing config does.
- Zod 4: `import { z } from "zod"`.

## Don't

- Don't add Python, Rust, Redux, Next.js, MongoDB or a server. SQLite + files only.
- Don't add a dependency without saying why in the spec's implementation notes.
- Don't print or log API keys, full transcripts at info level, or user file paths in telemetry.
- Don't build features that aren't in a `Ready` spec.
