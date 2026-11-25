# ADR-0002: The pipeline never imports Electron

Status: Accepted
Date: 2026-11-25

## Context

The pipeline is the product. It must be testable by an AI agent from the terminal, run in a
`utilityProcess`, and run from a CLI. Electron imports make all three harder.

## Decision

`src/main/pipeline/**` must not import `electron`, and neither may the two folders it depends
on: `src/main/ai/**` (LLM and transcription providers) and `src/main/media/**` (ffmpeg, whisper,
yt-dlp wrappers). Everything Electron-specific (paths from
`app.getPath`, `safeStorage`, windows) is resolved in main and passed in as plain values or
functions. A Vitest test scans the folder and fails on any `electron` import.

## Consequences

- Stages are factories that receive dependencies (`bins`, `ai`, `faces`, `log`).
- Face detection (needs a browser) is reached through an injected `detectFaces` function; the CLI
  and tests use a stub or a fixture file.
