# ADR-0004: Three languages (bn, en, hi), one per project

Status: Accepted
Date: 2026-11-25

## Context

The product's edge is doing Bangla and Hindi well, where the big clipping tools are weak.
Supporting "all languages" would spread testing thin.

## Decision

Support exactly `bn` (Bangla, Bengali script), `en` (English, Latin script) and `hi` (Hindi,
Devanagari script). The user picks the language per project (auto-detect may suggest, the user
confirms). English words inside Bangla/Hindi speech (code-mixing) are normal and supported.
All per-language values live in one registry (SPEC-001).

## Consequences

- Every language-sensitive spec has bn, en and hi acceptance criteria and fixtures.
- Urdu, Nepali, Assamese etc. are out of scope even though they share scripts or sound similar;
  the app warns if a transcript comes back in an unexpected script.
- Adding a fourth language later means adding one registry entry plus fixtures and an M1.5-style
  quality check.
