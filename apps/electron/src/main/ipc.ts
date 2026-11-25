import { app } from "electron";
import { ipcMainHandle } from "./utils/ipc";
import { isDev } from "./utils/isDev";

// every renderer → main channel is registered here (SPEC-130)
function registerIpc() {
  ipcMainHandle("app:get-info", () => ({ version: app.getVersion(), isDev: isDev() }));
}

export { registerIpc };
