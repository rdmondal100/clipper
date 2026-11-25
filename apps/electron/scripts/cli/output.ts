// SPEC-160 R5/R6: what the CLI prints. Text for people, or one JSON object per line with --json.
import type { Logger } from "../../src/main/pipeline/log";
import type { ProgressUpdate } from "../../src/main/pipeline/progress";
import type { StageName } from "@shared/schemas";

type Write = { out: (line: string) => void; err: (line: string) => void };

type CliResult =
  | { exitCode: 0; projectId: string; projectDir: string; exports: string[] }
  | { exitCode: 1; projectId: string; stage: StageName; clipId?: string; message: string; sourceMissing?: true; resume: string }
  | { exitCode: 2; message: string }
  | { exitCode: 130; projectId?: string; resume?: string };

type Reporter = {
  log: Logger;
  project: (info: { id: string; dir: string; created: boolean }) => void;
  progress: (update: ProgressUpdate) => void;
  result: (result: CliResult) => void;
};

function formatData(data: unknown) {
  if (data === undefined) return "";
  if (data instanceof Error) return ` ${data.message}`;
  if (typeof data === "string") return ` ${data}`;
  try {
    return ` ${JSON.stringify(data)}`;
  } catch {
    return ` ${String(data)}`;
  }
}

// R5: "[transcribe] 42% chunk 3/7", "[render c01] 100%"
function formatProgress(update: ProgressUpdate) {
  const label = update.clipId === undefined ? update.stage : `${update.stage} ${update.clipId}`;
  const percent = Math.floor(update.stageProgress * 100);
  return `[${label}] ${percent}%${update.note ? ` ${update.note}` : ""}`;
}

// JSON data must survive stringify: errors become their message
function jsonData(data: unknown) {
  return data instanceof Error ? data.message : data;
}

function createJsonReporter(write: Write, debug: boolean): Reporter {
  const line = (event: Record<string, unknown>) => write.out(JSON.stringify(event));
  const logAt = (level: keyof Logger) => (message: string, data?: unknown) => {
    if (level === "debug" && !debug) return;
    line({ type: "log", level, message, ...(data === undefined ? {} : { data: jsonData(data) }) });
  };
  return {
    log: { debug: logAt("debug"), info: logAt("info"), warn: logAt("warn"), error: logAt("error") },
    project: (info) => line({ type: "project", ...info }),
    progress: (update) => line({ type: "progress", ...update }),
    result: (result) => line({ type: "result", ...result }),
  };
}

function createTextReporter(write: Write, debug: boolean): Reporter {
  let lastProgress = "";
  const log: Logger = {
    debug: (message, data) => {
      if (debug) write.err(`debug: ${message}${formatData(data)}`);
    },
    info: (message, data) => write.out(`${message}${formatData(data)}`),
    warn: (message, data) => write.err(`warning: ${message}${formatData(data)}`),
    error: (message, data) => write.err(`error: ${message}${formatData(data)}`),
  };

  function result(result: CliResult) {
    switch (result.exitCode) {
      case 0:
        write.out(`\nDone. Project folder: ${result.projectDir}`);
        if (result.exports.length === 0) write.out("No exported files yet.");
        else write.out(["Exported:", ...result.exports.map((file) => `  ${file}`)].join("\n"));
        return;
      case 1:
        // the runner already logged "<stage> failed: <message>"
        if (result.sourceMissing) write.err("The source video was moved or changed. Put it back, or start a new project.");
        write.err(`To resume after fixing it: ${result.resume}`);
        return;
      case 2:
        write.err(`error: ${result.message}`);
        return;
      case 130:
        write.err(result.resume ? `Cancelled. To resume: ${result.resume}` : "Cancelled.");
        return;
    }
  }

  return {
    log,
    project: ({ id, dir, created }) => write.out(`${created ? "Created" : "Opened"} project ${id}: ${dir}`),
    progress: (update) => {
      // whole percents repeat while a stage reports fine-grained progress
      const text = formatProgress(update);
      if (text === lastProgress) return;
      lastProgress = text;
      write.out(text);
    },
    result,
  };
}

function createReporter(options: { json: boolean; debug: boolean; write: Write }): Reporter {
  return options.json ? createJsonReporter(options.write, options.debug) : createTextReporter(options.write, options.debug);
}

export { createReporter, formatProgress };
export type { CliResult, Reporter, Write };
