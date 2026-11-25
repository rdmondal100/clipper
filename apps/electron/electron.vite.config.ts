import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";

const shared = { "@shared": resolve(import.meta.dirname, "src/shared") };

export default defineConfig({
  // two entries: the app (index) and the job worker that runs the pipeline in a utilityProcess (SPEC-120)
  // dependencies (native modules such as better-sqlite3, later) stay external and load from node_modules
  main: {
    resolve: { alias: shared },
    build: {
      rollupOptions: {
        input: {
          index: resolve(import.meta.dirname, "src/main/index.ts"),
          worker: resolve(import.meta.dirname, "src/main/jobs/worker.ts"),
        },
      },
    },
  },
  // a sandboxed preload can't be an ES module, so it is built as CommonJS
  preload: {
    resolve: { alias: shared },
    build: {
      rollupOptions: {
        output: { format: "cjs", entryFileNames: "[name].cjs" },
      },
    },
  },
  // "@" is the renderer source, as shadcn's components.json expects
  renderer: {
    resolve: { alias: { ...shared, "@": resolve(import.meta.dirname, "src/renderer/src") } },
    plugins: [react(), tailwindcss()],
  },
});
