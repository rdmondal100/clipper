import { join } from "node:path";

// every file a stage reads or writes, by name, so no stage builds paths by hand (SPEC-010 layout)
function projectPaths(dir: string) {
  return {
    dir,
    project: join(dir, "project.json"),
    manifest: join(dir, "manifest.json"),
    probe: join(dir, "media", "probe.json"),
    audio: join(dir, "media", "audio_16k.wav"),
    proxy: join(dir, "media", "proxy_480p.mp4"),
    loudness: join(dir, "media", "loudness.json"),
    transcript: join(dir, "stages", "transcript.json"),
    transcribeChunk: (index: number) => join(dir, "stages", "transcribe-chunks", `${String(index).padStart(2, "0")}.json`),
    segments: join(dir, "stages", "segments.json"),
    candidates: join(dir, "stages", "candidates.json"),
    clips: join(dir, "stages", "clips.json"),
    faces: (clipId: string) => join(dir, "stages", "faces", `${clipId}.json`),
    reframe: (clipId: string) => join(dir, "stages", "reframe", `${clipId}.json`),
    captions: (clipId: string) => join(dir, "stages", "captions", `${clipId}.ass`),
    exportVideo: (clipId: string, presetId: string) => join(dir, "exports", `${clipId}_${presetId}.mp4`),
    exportThumb: (clipId: string, presetId: string) => join(dir, "exports", `${clipId}_${presetId}.jpg`),
    exportMeta: (clipId: string) => join(dir, "exports", `${clipId}.meta.json`),
    jobLog: (jobId: string) => join(dir, "logs", `job-${jobId}.log`),
  };
}

type ProjectPaths = ReturnType<typeof projectPaths>;

export { projectPaths };
export type { ProjectPaths };
