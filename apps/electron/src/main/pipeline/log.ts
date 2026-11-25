// the pipeline logs through this, so the worker can write job files and the CLI can print (SPEC-020 R9)
type Logger = {
  debug: (message: string, data?: unknown) => void;
  info: (message: string, data?: unknown) => void;
  warn: (message: string, data?: unknown) => void;
  error: (message: string, data?: unknown) => void;
};

// for tests and quiet runs
const silentLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

export { silentLogger };
export type { Logger };
