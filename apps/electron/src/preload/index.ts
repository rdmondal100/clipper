import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type { ClipperApi, EventPayloadMapping, EventPushMapping, InvokeChannel, PushChannel } from "@shared/types";

// typed ipcRenderer.invoke: the channel decides the request and the response
function ipcInvoke<Key extends InvokeChannel>(
  key: Key,
  request?: EventPayloadMapping[Key]["request"],
): Promise<EventPayloadMapping[Key]["response"]> {
  return ipcRenderer.invoke(key, request);
}

// typed listener for pushes from main; returns a function that removes it (used from M3: job:progress)
function ipcOn<Key extends PushChannel>(key: Key, listener: (payload: EventPushMapping[Key]) => void) {
  const wrapped = (_event: IpcRendererEvent, payload: EventPushMapping[Key]) => listener(payload);
  ipcRenderer.on(key, wrapped);
  return () => {
    ipcRenderer.off(key, wrapped);
  };
}
void ipcOn;

// the only bridge to the main process; the page gets no Node or Electron access
const clipper: ClipperApi = {
  getInfo: () => ipcInvoke("app:get-info"),
};

contextBridge.exposeInMainWorld("clipper", clipper);
