# ADR-0001: Electron + electron-vite, same layout as the WorkPulse agent

Status: Accepted
Date: 2026-11-25

## Context

The developer already ships an Electron app (WorkPulse agent) with electron-vite, React 19,
Tailwind 4, shadcn/ui, Zustand, typed IPC through `src/shared/types.ts`, a sandboxed preload and
Vitest. Development is AI-driven, so a familiar, mainstream layout matters more than a smaller
binary.

## Decision

Use Electron + electron-vite with the same folder layout and conventions:
`src/main/<feature>/index.ts`, `src/preload/index.ts`, `src/renderer/src/{components,hooks,lib,pages,store,styles}`,
`src/shared/`, tests next to code, `resources/` for bundled binaries, `scripts/` for build helpers.

## Consequences

- Patterns (typed IPC, frame validation, result types, main-owned state) are copied, not reinvented.
- Larger installer than Tauri; acceptable because models are downloaded separately anyway.
- Chromium gives us WebGL/WASM for MediaPipe face detection without Python.
