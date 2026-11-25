# resources/bin/win-x64/

Put these here for development (they are git-ignored):

- `ffmpeg.exe`, `ffprobe.exe` — a build that includes libass
- `whisper-cli.exe` and the DLLs that come with it — from the whisper.cpp Windows release
- `yt-dlp.exe` — only needed for URL import (SPEC-190)

Then run `npm run check:bins`. Record the versions and URLs you used in
`docs/specs/170-binaries-packaging.md` → Implementation notes.
