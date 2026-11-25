import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// unit tests cover main-process and pipeline logic only; nothing here starts Electron
export default defineConfig({
  resolve: { alias: { "@shared": resolve(import.meta.dirname, "src/shared") } },
  test: {
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    environment: "node",
  },
});
