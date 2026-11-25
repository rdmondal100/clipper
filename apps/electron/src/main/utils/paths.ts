import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { app } from "electron";
import { isDev } from "./isDev";

// built files sit next to each other in out/: main/ (index.js, worker.js), preload/, renderer/
const outDir = join(import.meta.dirname, "..");

function preloadPath() {
  return join(outDir, "preload", "index.cjs");
}

function rendererHtmlPath() {
  return join(outDir, "renderer", "index.html");
}

// the utilityProcess entry that runs the pipeline (SPEC-120)
function workerPath() {
  return join(outDir, "main", "worker.js");
}

// where the window loads from: the Vite dev server, or the built file
function rendererUrl() {
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  return isDev() && devUrl ? devUrl : pathToFileURL(rendererHtmlPath()).href;
}

// resources/ in the repo while developing; the installer copies its contents next to the app (SPEC-170)
function resourcesDir() {
  return app.isPackaged ? process.resourcesPath : join(app.getAppPath(), "resources");
}

function iconPath() {
  return join(resourcesDir(), "icon.png");
}

// ffmpeg.exe, ffprobe.exe, whisper-cli.exe, yt-dlp.exe
function binDir() {
  return app.isPackaged ? join(process.resourcesPath, "bin") : join(app.getAppPath(), "resources", "bin", "win-x64");
}

function fontsDir() {
  return join(resourcesDir(), "fonts");
}

function presetsPath() {
  return join(resourcesDir(), "presets.json");
}

// whisper models are downloaded, never bundled (SPEC-155)
function modelsDir() {
  return app.isPackaged ? join(app.getPath("userData"), "models") : join(app.getAppPath(), "resources", "models");
}

// default projects folder: outside appData so uninstalling never deletes user work (SPEC-010 R1)
function defaultProjectsRoot() {
  return join(app.getPath("documents"), "Clipper", "Projects");
}

// encrypted API keys, see settings/ (SPEC-110 R5)
function keysFilePath() {
  return join(app.getPath("userData"), "keys.bin");
}

function databasePath() {
  return join(app.getPath("userData"), "clipper.db");
}

export {
  binDir,
  databasePath,
  defaultProjectsRoot,
  fontsDir,
  iconPath,
  keysFilePath,
  modelsDir,
  preloadPath,
  presetsPath,
  rendererHtmlPath,
  rendererUrl,
  resourcesDir,
  workerPath,
};
