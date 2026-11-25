// SPEC-160: run the same pipeline as the app, from a terminal, without Electron.
//   npm run clip -- <video> --lang bn|en|hi [options]
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { isLanguageCode, LANGUAGE_CODES } from "@shared/languages";
import { StageNameSchema } from "@shared/schemas";
import { createPipeline } from "../src/main/pipeline";
import type { Logger } from "../src/main/pipeline/log";

const EXIT = { ok: 0, stageFailed: 1, badArgs: 2, cancelled: 130 } as const;

const USAGE = `Usage: npm run clip -- <video> --lang ${LANGUAGE_CODES.join("|")} [options]

  --projects-dir <dir>   default ./.projects
  --project <id>         reuse an existing project
  --to <stage>           stop after this stage
  --force <a,b>          rerun these stages
  --clips <n>            default 10
  --min <sec>            default 20
  --max <sec>            default 60
  --preset <a,b>         default youtube-shorts
  --llm <kind:model>     e.g. ollama:<model>
  --llm-url <url>        base URL for ollama / openai-compatible
  --context <tokens>     LLM context size
  --transcriber <kind>   whisper-local | openai-compatible-transcription
  --whisper-model <name> default from the language registry
  --replay-llm <dir>     replay recorded LLM responses
  --json                 JSON progress lines`;

function fail(message: string): never {
  console.error(`${message}\n\n${USAGE}`);
  process.exit(EXIT.badArgs);
}

function parse() {
  try {
    return parseArgs({
      allowPositionals: true,
      options: {
        lang: { type: "string" },
        "projects-dir": { type: "string", default: ".projects" },
        project: { type: "string" },
        to: { type: "string" },
        force: { type: "string" },
        clips: { type: "string", default: "10" },
        min: { type: "string", default: "20" },
        max: { type: "string", default: "60" },
        preset: { type: "string", default: "youtube-shorts" },
        llm: { type: "string" },
        "llm-url": { type: "string" },
        context: { type: "string" },
        transcriber: { type: "string", default: "whisper-local" },
        "whisper-model": { type: "string" },
        "replay-llm": { type: "string" },
        json: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
    });
  } catch (error) {
    fail((error as Error).message);
  }
}

// prints progress for people, or one JSON object per line for scripts
function createConsoleLogger(json: boolean): Logger {
  const write = (level: string) => (message: string, data?: unknown) => {
    if (level === "debug" && !process.env.CLIPPER_DEBUG) return;
    if (json) console.log(JSON.stringify({ level, message, data }));
    else console.log(`[${level}] ${message}`);
  };
  return { debug: write("debug"), info: write("info"), warn: write("warn"), error: write("error") };
}

async function main() {
  const { values, positionals } = parse();
  if (values.help) {
    console.log(USAGE);
    return EXIT.ok;
  }

  const [video] = positionals;
  if (!video && !values.project) fail("Give a video file or --project <id>.");
  if (video && !existsSync(video)) fail(`Video not found: ${video}`);
  if (!values.lang) fail(`--lang is required: one of ${LANGUAGE_CODES.join(", ")}.`);
  if (!isLanguageCode(values.lang)) fail(`Unknown language "${values.lang}". Use one of ${LANGUAGE_CODES.join(", ")}.`);
  if (values.to && !StageNameSchema.safeParse(values.to).success) fail(`Unknown stage "${values.to}".`);

  const log = createConsoleLogger(values.json);
  const binDir = process.env.CLIPPER_BIN_DIR || resolve("resources", "bin", "win-x64");
  const exe = process.platform === "win32" ? ".exe" : "";
  const pipeline = createPipeline({
    bins: {
      ffmpeg: join(binDir, `ffmpeg${exe}`),
      ffprobe: join(binDir, `ffprobe${exe}`),
      whisperCli: join(binDir, `whisper-cli${exe}`),
      ytDlp: join(binDir, `yt-dlp${exe}`),
    },
    fontsDir: resolve("resources", "fonts"),
    modelsDir: resolve("resources", "models"),
    presets: [], // SPEC-100: load and parse resources/presets.json
    log,
  });

  // Ctrl+C aborts the run; the runner kills child processes and cleans up (SPEC-160 R3)
  const controller = new AbortController();
  process.once("SIGINT", () => controller.abort());

  // SPEC-160 M0: create the project folder (SPEC-010) for `video` under --projects-dir, then run.
  const projectDir = resolve(values["projects-dir"], values.project ?? "new");
  const result = await pipeline.run(projectDir, {
    to: values.to ? StageNameSchema.parse(values.to) : undefined,
    signal: controller.signal,
    onProgress: ({ stage, stageProgress }) => log.info(`${stage} ${Math.round(stageProgress * 100)}%`),
  });

  if (result.ok) {
    log.info(`Done: ${projectDir}`);
    return EXIT.ok;
  }
  if (result.cancelled) return EXIT.cancelled;
  log.error(`${result.stage} failed: ${result.message}`);
  return EXIT.stageFailed;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(EXIT.stageFailed);
  },
);
