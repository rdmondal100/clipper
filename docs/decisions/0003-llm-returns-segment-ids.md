# ADR-0003: The LLM returns segment IDs, never timestamps

Status: Accepted
Date: 2026-11-25

## Context

Small local models (7–9B) often invent or garble numbers such as `312.4`. Picking items from a
numbered list they can see is far more reliable, and the output is shorter.

## Decision

The transcript is sent as numbered segments (`[142] text…`). The LLM answers with
`startSegmentId` / `endSegmentId`. Code maps IDs to times and validates everything (SPEC-060).

## Consequences

- Clip boundaries can only fall on segment edges before snapping; SPEC-070 refines them.
- Segments must be short enough (max 15 s) to give useful precision (SPEC-050).
