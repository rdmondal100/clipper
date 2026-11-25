import { nativeTheme, shell, type WebContents } from "electron";
import { preloadPath, rendererUrl } from "../utils/paths";

// every window runs our page with the same locked-down settings
function secureWebPreferences() {
  return {
    preload: preloadPath(),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  };
}

// no new windows and no navigation away from our page; http(s) links open in the browser
function lockNavigation(contents: WebContents) {
  contents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) void shell.openExternal(url);
    return { action: "deny" };
  });
  contents.on("will-navigate", (event, url) => {
    if (new URL(url).origin !== new URL(rendererUrl()).origin) event.preventDefault();
  });
}

// the page's --background (renderer styles/global.css) in Windows light or dark, so a window never flashes white
function themeBackground() {
  return nativeTheme.shouldUseDarkColors ? "#0a0a0a" : "#ffffff";
}

export { lockNavigation, secureWebPreferences, themeBackground };
