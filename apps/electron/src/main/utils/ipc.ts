import { BrowserWindow, ipcMain, type WebContents, type WebFrameMain } from "electron";
import type { EventPayloadMapping, EventPushMapping, InvokeChannel, PushChannel } from "@shared/types";
import { rendererUrl } from "./paths";

// only our own page may call IPC: the dev server's origin, or the exact built file
function validateEventFrame(frame: WebFrameMain | null) {
  if (!frame) throw new Error("IPC from a destroyed frame");
  const expected = new URL(rendererUrl());
  const actual = new URL(frame.url);
  const ok =
    expected.protocol === "file:" ? actual.href.split("#")[0] === expected.href : actual.origin === expected.origin;
  if (!ok) throw new Error(`Blocked IPC from ${frame.url}`);
}

// typed ipcMain.handle: the handler gets the request and returns the channel's response
function ipcMainHandle<Key extends InvokeChannel>(
  key: Key,
  handler: (
    request: EventPayloadMapping[Key]["request"],
  ) => EventPayloadMapping[Key]["response"] | Promise<EventPayloadMapping[Key]["response"]>,
) {
  ipcMain.handle(key, (event, request: EventPayloadMapping[Key]["request"]) => {
    validateEventFrame(event.senderFrame);
    return handler(request);
  });
}

// typed push from main to one window
function ipcWebContentsSend<Key extends PushChannel>(key: Key, webContents: WebContents, payload: EventPushMapping[Key]) {
  if (!webContents.isDestroyed()) webContents.send(key, payload);
}

// typed push from main to every open window
function ipcBroadcast<Key extends PushChannel>(key: Key, payload: EventPushMapping[Key]) {
  for (const window of BrowserWindow.getAllWindows()) ipcWebContentsSend(key, window.webContents, payload);
}

export { ipcBroadcast, ipcMainHandle, ipcWebContentsSend, validateEventFrame };
