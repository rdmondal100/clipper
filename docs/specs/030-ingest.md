# SPEC-030: Ingest

| | |
|---|---|
| **Status** | Ready |
| **Milestone** | M1 |
| **Depends on** | SPEC-010, SPEC-020, SPEC-170 (binaries) |
| **Code** | `src/main/pipeline/ingest/`, `src/main/media/ffmpeg.ts`, `ffprobe.ts` |

## Goal

Read the source video once and produce everything later stages need: metadata, a 16 kHz mono WAV
for transcription, a light proxy for the UI, and a loudness curve for scoring and silence detection.

## Non-goals

URL download (SPEC-190). Choosing between several audio tracks (first default track only in v1).

## Outputs

- `media/probe.json` (`ProbeSchema`): duration, container, size, video `{ width, height, fps,
  codec, rotation }`, audio `{ codec, sampleRate, channels }`.
- `media/audio_16k.wav`: PCM s16le, 16 kHz, mono.
- `media/proxy_480p.mp4`: H.264, 480 px tall (even width, aspect kept, rotation applied),
  constant frame rate, a keyframe every second (smooth scrubbing), AAC audio, `+faststart`.
- `media/loudness.json`: RMS level in dBFS for every 0.5 s window, computed in Node from the WAV.

## Rules

- R1. Probe first with ffprobe (JSON output). Reject with a clear message if there is no audio
  stream ("This video has no sound, so there is nothing to transcribe").
- R2. Reject videos shorter than 60 s. Warn (don't block) above 6 hours.
- R3. Decode once: a single ffmpeg run writes both the WAV and the proxy.
- R4. Progress comes from ffmpeg `-progress pipe:1` (`out_time_us` ÷ duration).
- R5. Phone videos: apply rotation metadata; store displayed width/height in `probe.json`.
- R6. Variable frame rate sources are converted to constant frame rate in the proxy. All timing in
  the app uses seconds, never frame numbers.
- R7. Loudness is computed by streaming the WAV (no full read into memory for multi-hour files).
- R8. Pass the job `signal` to ffmpeg so cancel kills it.

## Language notes

Source paths may contain Bangla/Hindi characters (test it). Output paths are ASCII (SPEC-010).

## Errors

| Case | User sees |
|---|---|
| ffprobe fails / unsupported file | "Can't read this video. Try converting it to MP4." |
| No audio | see R1 |
| Disk full during write | "Not enough disk space" + free space needed |

## Acceptance criteria

- [ ] All fixtures (bn, en, hi) produce the four outputs, each valid by schema.
- [ ] WAV is 16 kHz mono s16le (checked with ffprobe in the test).
- [ ] Proxy is 480 px tall, has audio, keyframe interval ≤ 1 s.
- [ ] `loudness.json` has `ceil(duration / 0.5)` values (±1).
- [ ] A rotated phone-video fixture reports displayed dimensions.
- [ ] Source path with Bangla and Hindi characters works.
- [ ] Cancel during ingest kills ffmpeg within 2 s and leaves no outputs recorded.

## Test plan

- Unit: ffprobe JSON parsing with recorded outputs; loudness on a generated sine/silence WAV.
- Integration (skipped when binaries are missing): runs on `fixtures/*/short.mp4` (60–90 s).

## Open questions

- Proxy at 480p or 540p? (Start 480p; revisit if the review player looks too soft.)
