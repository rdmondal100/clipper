// utilityProcess entry (SPEC-120): runs the pipeline outside the main process so the window never
// freezes. Main sends { type: "start", job, project, providers, keys, bins, folders }; this replies
// with progress / done / error and aborts the run on { type: "cancel" }. Not built yet: for now it
// answers every message with an error so wiring mistakes are visible.

process.parentPort?.on("message", (event) => {
  const message = event.data as { type?: string } | undefined;
  process.parentPort?.postMessage({
    type: "error",
    message: `Worker not implemented (got "${message?.type ?? "unknown"}"): see docs/specs/120-jobs-worker.md`,
  });
});
