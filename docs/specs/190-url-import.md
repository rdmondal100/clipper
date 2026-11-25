# SPEC-190: URL import and rights

| | |
|---|---|
| **Status** | Draft |
| **Milestone** | M5 |
| **Depends on** | SPEC-030, SPEC-170 |
| **Code** | `src/main/pipeline/ingest/download.ts`, `src/main/media/ytdlp.ts` |

## Goal

Let creators import **their own** videos from a link (e.g. their YouTube channel) instead of
finding the original file.

## Rules (draft)

- R1. Every URL import requires ticking "I own this video or have permission to clip it." The
  confirmation and time are stored in `project.json`.
- R2. Download the best MP4-compatible format up to 1080p with yt-dlp into the project folder
  (`media/source.mp4`), with progress and cancel.
- R3. No cookies/login support in v1 (private videos: download the file yourself).
- R4. yt-dlp breaks when sites change: show "Update the downloader" when a download fails with an
  extractor error, which runs `yt-dlp -U`.
- R5. The UI and marketing describe this as importing your own videos. Downloading content you
  don't own may break the site's terms and copyright law; platforms are also penalising re-uploaded
  ("inauthentic") content.

## Open questions

- Keep this in v1 at all, or ship it later after validation (M6)?
