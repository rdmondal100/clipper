// shared by main, preload and renderer: every IPC channel and the data it carries (SPEC-130)

type AppInfo = {
  version: string;
  isDev: boolean;
};

// IPC can't carry thrown errors cleanly, so actions that can fail return a result
type Result<T extends object = object> = ({ ok: true } & T) | { ok: false; message: string };

// renderer → main: each channel's request and response
type EventPayloadMapping = {
  "app:get-info": { request: void; response: AppInfo };
  // SPEC-130 lists the channels added in M3–M5 (project:*, job:*, clip:*, settings:*, provider:*)
};

// main → renderer pushes; job:progress and job:changed arrive in M3 (SPEC-120)
type EventPushMapping = {
  "app:noop": never; // placeholder so the push helpers type-check before the first real push
};

type InvokeChannel = keyof EventPayloadMapping;
type PushChannel = keyof EventPushMapping;

// window.clipper, exposed by src/preload/index.ts
type ClipperApi = {
  getInfo: () => Promise<AppInfo>;
};

export type { AppInfo, ClipperApi, EventPayloadMapping, EventPushMapping, InvokeChannel, PushChannel, Result };
