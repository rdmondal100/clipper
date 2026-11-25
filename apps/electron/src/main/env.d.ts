// build-time variables electron-vite exposes to the main process (MAIN_VITE_* from .env files)
interface ImportMetaEnv {
  readonly MAIN_VITE_UPDATE_URL?: string; // auto-update feed, SPEC-170 (M5)
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
