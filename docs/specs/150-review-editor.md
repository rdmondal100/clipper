# SPEC-150: Review editor

| | |
|---|---|
| **Status** | Draft |
| **Milestone** | M4 |
| **Depends on** | SPEC-070, SPEC-090, SPEC-100, SPEC-120, SPEC-130 |
| **Code** | `src/renderer/src/pages/Review.tsx`, `components/{ClipList,ClipPlayer,TrimBar,CaptionEditor}.tsx` |

## Goal

This is where creators judge the product: see why each clip was picked, fix edges and captions in
seconds, and export only what they like.

## Layout (to refine with mockups)

- Left: clip list sorted by score — thumbnail, title (project language), duration, score, flags
  (e.g. "starts mid-thought"), the English `reason` on hover.
- Center: 9:16 preview player of the selected clip (proxy + live caption overlay, so edits show
  instantly without re-rendering).
- Below: trim bar over the waveform with draggable in/out handles that **snap to word boundaries**;
  the transcript of the clip with the active word highlighted.
- Right: caption text editor (per page), style preset, layout (fill / fit-blur / split), platforms,
  "Re-render" and "Export".

## Rules (draft)

- R1. Trims and caption edits are saved immediately to `clips.json` / an edits file and mark the
  clip `edited`; only that clip's per-clip stages rerun (SPEC-020 `clipIds`).
- R2. Caption edits keep word timing where words are unchanged; changed words get evenly
  distributed timing within their page.
- R3. Caption editing inputs set `lang` and use the bundled fonts, so Bangla/Hindi typing looks
  the same as the burned-in result.
- R4. Keyboard: J/K/L playback, I/O set in/out, ←/→ move by one word, Enter = export selected.
- R5. "Find more like this" and "Discard" feed nothing back to the model in v1 (logged locally for
  later).

## Acceptance criteria (to finalize)

- [ ] Trimming then re-rendering one clip touches only that clip's files.
- [ ] Editing a Bangla caption with a conjunct renders identically in preview and export.
- [ ] Review of 10 clips is usable on a 1366×768 laptop screen.
