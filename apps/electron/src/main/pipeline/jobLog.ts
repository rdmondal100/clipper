import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { Logger } from "./log";
import { errorCode } from "./project/files";

type Level = keyof Logger;

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

// SPEC-020 R9: logs/job-<jobId>.log gets info and above, so a log attached to a bug report holds no
// transcript text (debug); `redact` swaps user paths for placeholders. Everything also goes to `base`.
async function openJobLog(file: string, deps: { base: Logger; now: () => number; redact: Record<string, string> }) {
  const { base, now } = deps;
  // longest first, so a path inside another one is replaced whole
  const redactions = Object.entries(deps.redact)
    .filter(([text]) => text.length > 0)
    .sort(([a], [b]) => b.length - a.length);
  const scrub = (text: string) => redactions.reduce((out, [from, to]) => out.split(from).join(to), text);

  await mkdir(dirname(file), { recursive: true });
  const stream = createWriteStream(file, { flags: "a", encoding: "utf8" });
  let broken = false;
  // a log file we can't write must never fail the job
  stream.on("error", (error) => {
    if (!broken) base.warn(`Can't write the job log (${errorCode(error) || error.message})`);
    broken = true;
  });

  const write = (level: Level) => (message: string, data?: unknown) => {
    base[level](message, data);
    if (level === "debug" || broken) return;
    stream.write(`${new Date(now()).toISOString()} ${level.toUpperCase()} ${scrub(message + formatData(data))}\n`);
  };

  const log: Logger = { debug: write("debug"), info: write("info"), warn: write("warn"), error: write("error") };

  // waits for the file handle to close, so the project folder can be moved or deleted right after
  function close() {
    return new Promise<void>((resolve) => {
      if (stream.closed) return resolve();
      stream.once("close", () => resolve());
      stream.end();
    });
  }

  return { log, close };
}

export { openJobLog };
