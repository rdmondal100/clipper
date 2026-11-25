import { BrowserWindow, type NativeImage } from "electron";
import { rendererUrl } from "../utils/paths";
import { lockNavigation, secureWebPreferences, themeBackground } from "./shared";

const SIZE = { width: 1280, height: 800, minWidth: 1024, minHeight: 680 };

let mainWindow: BrowserWindow | null = null;

function createMainWindow(icon: NativeImage) {
  mainWindow = new BrowserWindow({
    ...SIZE,
    show: false,
    title: "Clipper",
    icon,
    autoHideMenuBar: true,
    backgroundColor: themeBackground(),
    webPreferences: secureWebPreferences(),
  });

  mainWindow.once("ready-to-show", () => showMainWindow());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  // SPEC-140 decides whether closing during a job hides to the tray instead

  lockNavigation(mainWindow.webContents);

  void mainWindow.loadURL(rendererUrl());
  return mainWindow;
}

function showMainWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function getMainWindow() {
  return mainWindow;
}

export { createMainWindow, getMainWindow, showMainWindow };
