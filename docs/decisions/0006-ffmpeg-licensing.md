# ADR-0006: FFmpeg build and licence

Status: Open — must be decided before M5 (shipping)
Date: 2026-11-25

## Context

FFmpeg builds that include libx264 are GPL. Shipping a GPL build inside a closed-source paid app
is a licence problem. Hardware encoders (NVENC, QuickSync, AMF) are available in LGPL builds, but
machines without a supported GPU still need a software H.264 encoder.

## Options

1. Open-source the app under a GPL-compatible licence and ship a GPL build (simplest technically).
2. Ship an LGPL build: hardware encoders + a non-GPL software fallback (e.g. OpenH264), accept
   lower software-encode quality.
3. Don't bundle FFmpeg; download it on first run as a separate component the user installs.

## Decision

Not decided. Development (M0–M4) may use any build. Record the choice here before M5 and update
SPEC-170.
