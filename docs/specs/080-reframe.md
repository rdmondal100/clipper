# SPEC-080: Reframe to 9:16

| | |
|---|---|
| **Status** | Draft (M1 uses a plain center crop inside SPEC-100) |
| **Milestone** | M2 |
| **Depends on** | SPEC-070, SPEC-100, ADR-0002 |
| **Code** | `src/main/pipeline/reframe/` (crop path math), `src/main/window/faceWindow.ts` + renderer page `FaceWorker` (detection) |

## Goal

Keep the speaker in frame when a 16:9 video becomes 9:16, with smooth camera-like movement, and
offer layouts for podcasts.

## Design (to refine)

- Face detection runs in a hidden window (`#face-worker`) with MediaPipe Face Detector
  (`@mediapipe/tasks-vision`, WASM + WebGL). The pipeline calls an injected
  `detectFaces({ videoPath, times }): Promise<FaceFrame[]>`; main routes it to the face window.
  CLI/tests inject a stub or replay `fixtures/recorded/faces/*.json`.
- Sample only inside each clip, at 4 fps, on the proxy video.
- Output `stages/faces/<clipId>.json` (raw boxes) and `stages/reframe/<clipId>.json`
  (`{ layout, keyframes: Array<{ t: number; x: number }> }`, x = crop left edge in source pixels).

## Layouts

| Layout | When | How |
|---|---|---|
| `fill` | default, one main face | 9:16 crop following the face |
| `fit-blur` | no faces / slides / screen recordings | whole frame scaled to width, blurred zoomed copy behind |
| `split` | two faces present > 60% of the clip | two crops stacked top/bottom |

## Rules (draft)

- R1. Subject = the face present in the most samples; ties → the larger face.
- R2. Dead zone: don't move the crop while the face stays within the middle 40% of the crop.
- R3. Max pan speed 25% of crop width per second; ease in/out.
- R4. No face for > 2 s → glide to center; no face for most of the clip → suggest `fit-blur`.
- R5. Render turns keyframes into an ffmpeg crop expression or `sendcmd` file (decide in M2).

## Open questions

- Which person is speaking in a two-person shot (mouth movement vs audio diarization)?
- MediaPipe model: short-range vs full-range detector for podcast framing.
- CSP for the face window needs `'wasm-unsafe-eval'`; keep it only on that window.

## Acceptance criteria (to finalize)

- [ ] Crop path never leaves the frame; pan speed limit holds (property test).
- [ ] A fixture with a walking speaker keeps the face inside the crop ≥ 95% of samples.
- [ ] `split` is suggested for the two-person podcast fixture.
