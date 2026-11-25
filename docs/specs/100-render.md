# SPEC-100: Render and platform presets

| | |
|---|---|
| **Status** | Ready (M1 part) |
| **Milestone** | M1 (center crop, one preset), M2 (reframe keyframes, all presets) |
| **Depends on** | SPEC-070, SPEC-090, SPEC-080 (M2), SPEC-170 |
| **Code** | `src/main/pipeline/render/` (`ffmpegArgs.ts`, `encoders.ts`, `presets.ts`), `resources/presets.json` |

## Goal

Produce upload-ready vertical MP4s for each selected platform, as fast as the hardware allows.

## Presets

Shipped as `resources/presets.json` (data, not code), parsed with `PresetSchema`:

```ts
{ id: "youtube-shorts" | "facebook-reels" | "instagram-reels" | "tiktok",
  label: string, width: 1080, height: 1920, maxFps: 30 | 60,
  minDurationSec: number, maxDurationSec: number,
  loudnessLUFS: -14, captionSafe: { top: number; bottom: number; side: number } }
```

Duration limits and safe zones change over time. **Check each platform's current rules before
every release** and update the JSON; never hard-code them in TypeScript.

## Outputs per clip and preset

- `exports/<clipId>_<presetId>.mp4` — H.264 High, AAC 48 kHz stereo, `+faststart`.
- `exports/<clipId>_<presetId>.jpg` — thumbnail from 0.5 s into the clip.
- `exports/<clipId>.meta.json` — title, hook, (M2) description and hashtags in the project language.

## Rules

- R1. **Encoder choice** at app start (cached): try `h264_nvenc`, `h264_qsv`, `h264_amf`, then the
  software encoder allowed by ADR-0006. "Listed in `ffmpeg -encoders`" isn't enough — each is
  verified by encoding one second of black video.
- R2. Seek accurately: `-ss <start> -to <end>` with re-encode, from the **source** (not the proxy).
- R3. M1 filter chain: center crop to 9:16 → scale to 1080×1920 → `subtitles=<ass>:fontsdir=<fonts>`
  → fps = min(source fps, preset maxFps). M2 replaces the crop with SPEC-080 keyframes/layouts.
- R4. Audio: single-pass `loudnorm` to the preset's LUFS target.
- R5. One render at a time (they already saturate CPU/GPU); progress from `-progress pipe:1`.
- R6. File names are ASCII (`c03_youtube-shorts.mp4`); the human title lives in `meta.json`.
- R7. Pass the job `signal`; cancel deletes the partial file.

## Language notes

Captions come from SPEC-090; the fonts folder from SPEC-170 must be passed as `fontsdir`.
`meta.json` text is in the project language (UTF-8, NFC).

## Acceptance criteria

- [ ] Output is 1080×1920, duration within ±0.1 s of the clip, has an audio stream (ffprobe check).
- [ ] `moov` atom precedes `mdat` (faststart) — checked by reading the file header.
- [ ] Encoder fallback: when the first two encoders fail the test encode, the third is used.
- [ ] Generated ffmpeg args snapshot-tested for one clip per language (catches accidental changes).
- [ ] Integrated loudness of output within ±2 LU of target on one fixture (skipped without ffmpeg).
- [ ] Cancel removes the partial MP4.

## Open questions

- Do we export one file per platform, or one file plus per-platform metadata? (Start: one file per
  selected preset; most presets are identical, so dedupe identical settings and copy.)
