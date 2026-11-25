// SPEC-160: command-line arguments for `npm run clip`. Pure: no file system, no process.
import { parseArgs } from "node:util";
import { isLanguageCode, LANGUAGE_CODES } from "@shared/languages";
import type { LanguageCode } from "@shared/languages";
import { PresetIdSchema, StageNameSchema } from "@shared/schemas";
import type { Project, StageName } from "@shared/schemas";

type TranscriberKind = "whisper-local" | "openai-compatible-transcription";

// a new project from a video, or an existing one (its language and settings live in project.json)
type ClipTarget =
  | { kind: "new"; video: string; language: LanguageCode; settings: Project["settings"] }
  | { kind: "existing"; projectId: string; language?: LanguageCode }; // language: only checked

type ClipArgs = {
  target: ClipTarget;
  projectsDir?: string; // as typed; undefined → apps/electron/.projects
  to?: StageName;
  force: StageName[];
  transcriber: TranscriberKind;
  pending: string[]; // M1 options that were given but have no stage to use them yet
  json: boolean;
};

type ParsedArgs = { kind: "help" } | { kind: "run"; args: ClipArgs } | { kind: "error"; message: string };

const DEFAULT_SETTINGS: Project["settings"] = {
  clipCount: 10,
  minSec: 20,
  maxSec: 60,
  presets: ["youtube-shorts"],
};

const TRANSCRIBERS: readonly TranscriberKind[] = ["whisper-local", "openai-compatible-transcription"];
const SETTING_OPTIONS = ["clips", "min", "max", "preset"] as const;
// accepted now so scripts don't break later; drop one from this list when its spec wires it up
const PENDING_OPTIONS = ["llm", "llm-url", "context", "whisper-model", "replay-llm"] as const;

const USAGE = `Usage: npm run clip -- <video> --lang ${LANGUAGE_CODES.join("|")} [options]
       npm run clip -- --project <id> [options]

  --projects-dir <dir>   default ./.projects (inside apps/electron)
  --project <id>         reuse an existing project instead of creating one
  --to <stage>           stop after this stage (e.g. --to transcribe)
  --force <a,b>          rerun these stages
  --clips <n>            default ${DEFAULT_SETTINGS.clipCount} (new projects only)
  --min <sec>            default ${DEFAULT_SETTINGS.minSec} (new projects only)
  --max <sec>            default ${DEFAULT_SETTINGS.maxSec} (new projects only)
  --preset <a,b>         default ${DEFAULT_SETTINGS.presets.join(",")} (new projects only)
  --llm <kind:model>     e.g. ollama:<model>
  --llm-url <url>        base URL for ollama / openai-compatible
  --context <tokens>     LLM context size
  --transcriber <kind>   ${TRANSCRIBERS.join(" | ")}
  --whisper-model <name> default from the language registry
  --replay-llm <dir>     replay recorded LLM responses
  --json                 JSON lines instead of text

Exit codes: 0 done, 1 a stage failed, 2 bad arguments or missing binaries, 130 cancelled.`;

const OPTIONS = {
  lang: { type: "string" },
  "projects-dir": { type: "string" },
  project: { type: "string" },
  to: { type: "string" },
  force: { type: "string" },
  clips: { type: "string" },
  min: { type: "string" },
  max: { type: "string" },
  preset: { type: "string" },
  llm: { type: "string" },
  "llm-url": { type: "string" },
  context: { type: "string" },
  transcriber: { type: "string" },
  "whisper-model": { type: "string" },
  "replay-llm": { type: "string" },
  json: { type: "boolean", default: false },
  help: { type: "boolean", short: "h", default: false },
} as const;

class ArgError extends Error {}

// "a, b,,a" → ["a", "b"], each checked against `allowed`
function parseList<T extends string>(option: string, value: string, allowed: readonly T[]): T[] {
  const items = [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
  if (items.length === 0) throw new ArgError(`--${option} needs at least one value: ${allowed.join(", ")}.`);
  const unknown = items.filter((item) => !(allowed as readonly string[]).includes(item));
  if (unknown.length > 0) throw new ArgError(`Unknown --${option} value "${unknown.join(", ")}". Use: ${allowed.join(", ")}.`);
  return items as T[];
}

function parseOne<T extends string>(option: string, value: string, allowed: readonly T[]): T {
  const item = value.trim();
  if (!(allowed as readonly string[]).includes(item)) throw new ArgError(`Unknown --${option} value "${value}". Use one of: ${allowed.join(", ")}.`);
  return item as T;
}

function parseSeconds(option: string, value: string) {
  const seconds = /^\d+(\.\d+)?$/.test(value) ? Number(value) : Number.NaN;
  if (!(seconds > 0)) throw new ArgError(`--${option} must be a number of seconds above 0, got "${value}".`);
  return seconds;
}

function parseClipCount(value: string) {
  const count = /^\d+$/.test(value) ? Number(value) : Number.NaN;
  if (!(count >= 1 && count <= 30)) throw new ArgError(`--clips must be a whole number from 1 to 30, got "${value}".`);
  return count;
}

function parseSettings(values: Partial<Record<(typeof SETTING_OPTIONS)[number], string>>): Project["settings"] {
  const settings = {
    clipCount: values.clips === undefined ? DEFAULT_SETTINGS.clipCount : parseClipCount(values.clips),
    minSec: values.min === undefined ? DEFAULT_SETTINGS.minSec : parseSeconds("min", values.min),
    maxSec: values.max === undefined ? DEFAULT_SETTINGS.maxSec : parseSeconds("max", values.max),
    presets: values.preset === undefined ? DEFAULT_SETTINGS.presets : parseList("preset", values.preset, PresetIdSchema.options),
  };
  if (settings.minSec >= settings.maxSec) {
    throw new ArgError(`--min (${settings.minSec}) must be shorter than --max (${settings.maxSec}).`);
  }
  return settings;
}

function parseOrThrow(argv: string[]): ParsedArgs {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, allowPositionals: true, options: OPTIONS });
  } catch (error) {
    throw new ArgError((error as Error).message);
  }
  const { values, positionals } = parsed;
  if (values.help) return { kind: "help" };

  if (positionals.length > 1) {
    throw new ArgError(`Give one video, got ${positionals.length} (put quotes around a path with spaces).`);
  }
  const [video] = positionals;
  const projectId = values.project;
  if (video && projectId) throw new ArgError("Give a video or --project <id>, not both.");

  const lang = values.lang;
  if (lang !== undefined && !isLanguageCode(lang)) {
    throw new ArgError(`Unknown language "${lang}". Use one of ${LANGUAGE_CODES.join(", ")}.`);
  }

  let target: ClipTarget;
  if (projectId) {
    // settings feed the stage hashes, so they are fixed when the project is created
    const settingFlags = SETTING_OPTIONS.filter((option) => values[option] !== undefined);
    if (settingFlags.length > 0) {
      throw new ArgError(`${settingFlags.map((option) => `--${option}`).join(", ")} only apply when creating a project; drop them with --project.`);
    }
    target = { kind: "existing", projectId, language: lang };
  } else if (video) {
    if (lang === undefined) throw new ArgError(`--lang is required: one of ${LANGUAGE_CODES.join(", ")}.`);
    target = { kind: "new", video, language: lang, settings: parseSettings(values) };
  } else {
    throw new ArgError("Give a video file or --project <id>.");
  }

  return {
    kind: "run",
    args: {
      target,
      projectsDir: values["projects-dir"],
      to: values.to === undefined ? undefined : parseOne("to", values.to, StageNameSchema.options),
      force: values.force === undefined ? [] : parseList("force", values.force, StageNameSchema.options),
      transcriber: values.transcriber === undefined ? "whisper-local" : parseOne("transcriber", values.transcriber, TRANSCRIBERS),
      pending: PENDING_OPTIONS.filter((option) => values[option] !== undefined).map((option) => `--${option}`),
      json: values.json,
    },
  };
}

// never throws: bad input becomes { kind: "error" } so the entry point can exit 2 (R4)
function parseClipArgs(argv: string[]): ParsedArgs {
  try {
    return parseOrThrow(argv);
  } catch (error) {
    if (error instanceof ArgError) return { kind: "error", message: error.message };
    throw error;
  }
}

export { DEFAULT_SETTINGS, parseClipArgs, USAGE };
export type { ClipArgs, ClipTarget, ParsedArgs, TranscriberKind };
