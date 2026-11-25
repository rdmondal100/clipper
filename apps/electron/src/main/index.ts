import { app, BrowserWindow, nativeImage } from "electron";
import { registerIpc } from "./ipc";
import { iconPath } from "./utils/paths";
import { createMainWindow, showMainWindow } from "./window/mainWindow";

// one instance: a second launch focuses the first window and exits
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => showMainWindow());

  app.on("window-all-closed", () => app.quit());

  void app.whenReady().then(() => {
    app.setAppUserModelId("com.clipper.desktop");
    registerIpc();
    // SPEC-130: registerMediaProtocol() goes here, before the first window loads

    const icon = nativeImage.createFromPath(iconPath());
    createMainWindow(icon);

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow(icon);
    });
  });
}
