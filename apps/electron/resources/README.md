# resources/

Copied next to the app by the installer (`extraResources` in `electron-builder.json`). Paths are
resolved only in `src/main/utils/paths.ts`.

| Path | What | In git? |
|---|---|---|
| `icon.png` | App icon (placeholder, replace before M5) | yes |
| `presets.json` | Platform presets (SPEC-100). Verify limits before each release. | yes |
| `fonts/` | Caption fonts (SPEC-001, SPEC-090), static TTFs + `OFL.txt` | yes (OFL allows it) |
| `bin/win-x64/` | ffmpeg, ffprobe, whisper-cli (+ DLLs), yt-dlp (SPEC-170) | no |
| `models/` | Whisper models in development (SPEC-155); userData when packaged | no |

Run `npm run check:bins` to see what's missing.
