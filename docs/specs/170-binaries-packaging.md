# SPEC-170: Binaries, fonts and packaging

| | |
|---|---|
| **Status** | Ready (M0 part); M5 part Draft |
| **Milestone** | M0 (`check:bins`), M5 (installer) |
| **Depends on** | ADR-0006 |
| **Code** | `scripts/check-bins.mjs`, `scripts/fetch-binaries.mjs` (M5), `electron-builder.json`, `resources/` |

## Goal

The app and CLI always know where ffmpeg, ffprobe, whisper-cli, yt-dlp, fonts and models are, and
can tell the developer or user exactly what's missing.

## Layout

```
resources/
  bin/win-x64/   ffmpeg.exe ffprobe.exe whisper-cli.exe (+ its DLLs) yt-dlp.exe   (git-ignored)
  fonts/         HindSiliguri-Bold.ttf Hind-Bold.ttf Montserrat-ExtraBold.ttf + OFL.txt
  presets.json   SPEC-100
  licenses/      third-party licence texts (M5)
  icon.png
models/ (outside resources, in userData in production; resources/models in dev, git-ignored)
```

## M0: `npm run check:bins`

- R1. Checks each binary exists and runs (`-version` / `--version`), prints its version.
- R2. Checks ffmpeg has the `subtitles` filter (libass) and lists which H.264 encoders it reports.
- R3. Checks the three caption fonts exist.
- R4. Exits 0 if everything is present, 2 otherwise, with where to get each missing item:
  - FFmpeg: a Windows build that includes libass (e.g. the "full" builds from gyan.dev or BtbN);
    for distribution see ADR-0006.
  - whisper.cpp: Windows release from the official whisper.cpp GitHub repository (CPU, CUDA or
    Vulkan build); copy `whisper-cli.exe` and its DLLs.
  - yt-dlp: `yt-dlp.exe` from its GitHub releases.
  - Fonts: Google Fonts (Hind Siliguri, Hind, Montserrat), static TTFs, SIL OFL.
- R5. Record the exact versions and download URLs you used in this spec's implementation notes.

## M5: packaging (draft)

- `extraResources`: `resources/bin/win-x64 → bin`, `resources/fonts → fonts`, `presets.json`,
  `licenses`. `utils/paths.ts` resolves them under `process.resourcesPath` when packaged, like
  WorkPulse's `siteReaderPath()`.
- `asarUnpack` for `better-sqlite3` (native, SPEC-120).
- NSIS installer, `oneClick: false` (choose install folder), don't delete projects on uninstall.
- `fetch-binaries.mjs` downloads pinned versions and verifies SHA-256 before `dist:win`.
- Auto-update with electron-updater; yt-dlp updated separately (`yt-dlp -U` on demand).
- Whisper models are downloaded in onboarding (SPEC-155), not bundled.

## Acceptance criteria

M0:

- [x] With nothing in `resources/bin`, `npm run check:bins` exits 2 and lists all four binaries
      with download hints.
- [ ] With everything present it exits 0 and prints versions, libass status and encoders.

M5 (to finalize):

- [ ] A clean Windows 10/11 VM installs the app and renders a clip with no manual steps.
- [ ] Licence texts for every bundled third-party component are in the installer.
