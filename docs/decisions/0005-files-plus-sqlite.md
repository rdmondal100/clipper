# ADR-0005: Project folders + SQLite, no server

Status: Accepted
Date: 2026-11-25

## Context

It's a desktop app. MongoDB/Redis would need a server process; projects contain large media files
anyway.

## Decision

- Each project is a folder of media + JSON files (source of truth for pipeline data).
- SQLite (better-sqlite3 + Drizzle) stores the project list, jobs, clips and settings.
- Project folders live in `Documents/Clipper/Projects` by default (user-changeable), never in
  appData, so uninstalling doesn't delete people's work.

## Consequences

- better-sqlite3 is a native module: it must be rebuilt for Electron and unpacked from asar
  (SPEC-002, SPEC-170).
- The database can be rebuilt by scanning project folders if it's lost or corrupted.
