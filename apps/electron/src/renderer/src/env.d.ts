import type { ClipperApi } from "@shared/types";

// exposed by src/preload/index.ts
declare global {
  interface Window {
    clipper: ClipperApi;
  }
}
