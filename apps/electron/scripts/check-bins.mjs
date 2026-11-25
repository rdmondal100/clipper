// SPEC-170 (M0): are the command-line tools, fonts and presets where the app expects them?
// Exit 0 = everything present, 2 = something missing (with where to get it).
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const binDir = process.env.CLIPPER_BIN_DIR || join(appDir, "resources", "bin", "win-x64");
const fontsDir = join(appDir, "resources", "fonts");
const exe = process.platform === "win32" ? ".exe" : "";

const TOOLS = [
  {
    name: "ffmpeg",
    args: ["-hide_banner", "-version"],
    hint: "A Windows build with libass, e.g. a 'full' build from gyan.dev or BtbN (licence: ADR-0006).",
  },
  {
    name: "ffprobe",
    args: ["-hide_banner", "-version"],
    hint: "Comes in the same download as ffmpeg.",
  },
  {
    name: "whisper-cli",
    args: ["-h"],
    hint: "Windows release of whisper.cpp (official GitHub repo): copy whisper-cli.exe and its DLLs.",
  },
  {
    name: "yt-dlp",
    args: ["--version"],
    hint: "yt-dlp.exe from the yt-dlp GitHub releases (only needed for SPEC-190).",
  },
];

let missing = 0;
const line = (ok, label, detail = "") => console.log(`${ok ? "✔" : "✘"} ${label}${detail ? `  ${detail}` : ""}`);

console.log(`Binaries in ${binDir}\n`);
for (const tool of TOOLS) {
  const path = join(binDir, `${tool.name}${exe}`);
  if (!existsSync(path)) {
    missing += 1;
    line(false, tool.name, `missing — ${tool.hint}`);
    continue;
  }
  const run = spawnSync(path, tool.args, { encoding: "utf8" });
  if (run.error) {
    missing += 1;
    line(false, tool.name, `won't start: ${run.error.message}`);
    continue;
  }
  const firstLine = `${run.stdout}${run.stderr}`.split(/\r?\n/).find((text) => text.trim()) ?? "";
  line(true, tool.name, tool.name === "whisper-cli" ? "runs" : firstLine.slice(0, 80));
}

// captions need libass (the subtitles filter); render needs a working H.264 encoder
const ffmpeg = join(binDir, `ffmpeg${exe}`);
if (existsSync(ffmpeg)) {
  const filters = spawnSync(ffmpeg, ["-hide_banner", "-filters"], { encoding: "utf8" }).stdout ?? "";
  const hasLibass = /\bsubtitles\b/.test(filters);
  if (!hasLibass) missing += 1;
  line(hasLibass, "ffmpeg libass (subtitles filter)", hasLibass ? "" : "missing — pick a build that includes libass");

  const encoders = spawnSync(ffmpeg, ["-hide_banner", "-encoders"], { encoding: "utf8" }).stdout ?? "";
  const found = ["h264_nvenc", "h264_qsv", "h264_amf", "libx264", "libopenh264"].filter((name) =>
    new RegExp(`\\b${name}\\b`).test(encoders),
  );
  line(found.length > 0, "H.264 encoders listed", found.join(", ") || "none");
  if (found.length === 0) missing += 1;
}

// caption fonts: read the file names from the language registry so there is one source of truth
console.log(`\nFonts in ${fontsDir}\n`);
const registry = readFileSync(join(appDir, "src", "shared", "languages.ts"), "utf8");
const fontFiles = [...registry.matchAll(/file:\s*"([^"]+\.ttf)"/g)].map((match) => match[1]);
for (const file of fontFiles) {
  const ok = existsSync(join(fontsDir, file));
  if (!ok) missing += 1;
  line(ok, file, ok ? "" : "missing — static TTF from Google Fonts (SIL OFL), see SPEC-170");
}

const presetsOk = existsSync(join(appDir, "resources", "presets.json"));
if (!presetsOk) missing += 1;
line(presetsOk, "resources/presets.json");

console.log(missing === 0 ? "\nAll set." : `\n${missing} item(s) missing. See docs/specs/170-binaries-packaging.md`);
process.exit(missing === 0 ? 0 : 2);
