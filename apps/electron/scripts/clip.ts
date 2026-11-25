// SPEC-160: run the same pipeline as the app, from a terminal, without Electron.
//   npm run clip -- <video> --lang bn|en|hi [options]
// The work lives in scripts/cli/ (tested); this file only touches the process.
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseClipArgs, USAGE } from "./cli/args";
import { createReporter } from "./cli/output";
import { runClip } from "./cli/run";

const appDir = resolve(import.meta.dirname, "..");

// R2: keys and CLIPPER_BIN_DIR may come from a git-ignored .env.local; real env vars win
const envFile = join(appDir, ".env.local");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const parsed = parseClipArgs(process.argv.slice(2));
if (parsed.kind === "help") {
  console.log(USAGE);
  process.exit(0);
}
if (parsed.kind === "error") {
  console.error(`error: ${parsed.message}\n\n${USAGE}`);
  process.exit(2);
}

const reporter = createReporter({
  json: parsed.args.json,
  debug: Boolean(process.env.CLIPPER_DEBUG),
  write: { out: (line) => console.log(line), err: (line) => console.error(line) },
});

// R3: the first Ctrl+C cancels and waits for cleanup; a second one quits at once (default handler)
const controller = new AbortController();
process.once("SIGINT", () => {
  reporter.log.warn("Cancelling… press Ctrl+C again to quit without cleaning up.");
  controller.abort();
});

runClip(parsed.args, {
  appDir,
  // npm runs scripts from apps/electron; INIT_CWD is where the user typed the command
  cwd: process.env.INIT_CWD || process.cwd(),
  env: process.env,
  signal: controller.signal,
  reporter,
}).then(
  (code) => process.exit(code),
  (error: unknown) => {
    reporter.log.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  },
);
