// thin, typed wrappers around the command-line tools, used by pipeline stages (no Electron here):
//   ffmpeg.ts / ffprobe.ts  SPEC-030, SPEC-100  (progress via -progress pipe:1, cancel via signal)
//   whisper.ts              SPEC-040
//   ytdlp.ts                SPEC-190
// Not built yet; add execa when you start SPEC-030.

type Bins = {
  ffmpeg: string;
  ffprobe: string;
  whisperCli: string;
  ytDlp: string;
};

export type { Bins };
