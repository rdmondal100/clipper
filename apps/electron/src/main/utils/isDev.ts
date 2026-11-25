import { app } from "electron";

// a packaged build is production; `electron-vite dev` is not packaged
function isDev() {
  return !app.isPackaged;
}

export { isDev };
