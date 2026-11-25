import { z } from "zod";
import { LANGUAGE_CODES } from "./languages";

// Zod schemas for everything that comes from outside our code: project files on disk, LLM output,
// ffprobe output. Each spec that owns a file is named next to its schema; change both together.

const LanguageCodeSchema = z.enum(LANGUAGE_CODES);

const StageNameSchema = z.enum([
  "ingest",
  "transcribe",
  "segment",
  "highlights",
  "snap",
  "reframe",
  "captions",
  "render",
]);

const PresetIdSchema = z.enum(["youtube-shorts", "facebook-reels", "instagram-reels", "tiktok"]);

// SPEC-010: project.json
const ProjectSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().regex(/^\d{8}-\d{6}-[a-z0-9]{6}$/),
  name: z.string().min(1),
  createdAt: z.iso.datetime(),
  language: LanguageCodeSchema,
  source: z.object({
    path: z.string().min(1),
    sizeBytes: z.number().int().nonnegative(),
    mtimeMs: z.number().nonnegative(),
    copied: z.boolean(), // true when the source was copied into media/
  }),
  settings: z.object({
    clipCount: z.number().int().min(1).max(30),
    minSec: z.number().positive(),
    maxSec: z.number().positive(),
    presets: z.array(PresetIdSchema).min(1),
    contentType: z.enum(["podcast", "lecture", "religious-talk", "tutorial", "vlog", "interview", "other"]).optional(),
  }),
  rights: z.object({ confirmedAt: z.iso.datetime(), url: z.string() }).optional(), // SPEC-190
});

// SPEC-010 / SPEC-020: manifest.json
const StageRecordSchema = z.object({
  version: z.number().int().positive(),
  inputHash: z.string().min(1),
  outputs: z.array(z.string()),
  completedAt: z.iso.datetime(),
  durationMs: z.number().nonnegative(),
});

const ManifestSchema = z.object({
  schemaVersion: z.literal(1),
  stages: z.partialRecord(StageNameSchema, StageRecordSchema),
  // per-clip stages (reframe, captions, render) record per clip so one clip can re-render alone
  clips: z.record(z.string(), z.partialRecord(StageNameSchema, StageRecordSchema)),
});

// SPEC-030: media/probe.json
const ProbeSchema = z.object({
  schemaVersion: z.literal(1),
  durationSec: z.number().positive(),
  container: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  video: z.object({
    width: z.number().int().positive(), // displayed size, rotation applied
    height: z.number().int().positive(),
    fps: z.number().positive(),
    codec: z.string(),
    rotation: z.number(),
  }),
  audio: z.object({
    codec: z.string(),
    sampleRate: z.number().int().positive(),
    channels: z.number().int().positive(),
  }),
});

// SPEC-030: media/loudness.json, RMS dBFS per 0.5 s window
const LoudnessSchema = z.object({
  schemaVersion: z.literal(1),
  windowSec: z.literal(0.5),
  dbfs: z.array(z.number()),
});

// SPEC-040: stages/transcript.json
const WordSchema = z.object({
  w: z.string().min(1),
  s: z.number().nonnegative(),
  e: z.number().nonnegative(),
  p: z.number().min(0).max(1).optional(),
});

const TranscriptSchema = z.object({
  schemaVersion: z.literal(1),
  language: LanguageCodeSchema,
  provider: z.string(),
  model: z.string(),
  durationSec: z.number().positive(),
  words: z.array(WordSchema),
  scriptCheck: z.union([
    z.object({ ok: z.literal(true) }),
    z.object({ ok: z.literal(false), reason: z.string() }),
  ]),
  warnings: z.array(z.string()),
});

// SPEC-050: stages/segments.json
const SegmentSchema = z.object({
  id: z.number().int().nonnegative(),
  start: z.number().nonnegative(),
  end: z.number().nonnegative(),
  text: z.string().min(1),
  firstWord: z.number().int().nonnegative(),
  lastWord: z.number().int().nonnegative(),
});

const SegmentsSchema = z.object({
  schemaVersion: z.literal(1),
  segments: z.array(SegmentSchema),
});

// SPEC-060: what the LLM must return for one window (validated again in highlights/validate.ts)
const RubricSchema = z.object({
  hook: z.number().int().min(1).max(10),
  standalone: z.number().int().min(1).max(10),
  payoff: z.number().int().min(1).max(10),
  emotion: z.number().int().min(1).max(10),
  clarity: z.number().int().min(1).max(10),
});

const LlmCandidateSchema = z.object({
  startSegmentId: z.number().int().nonnegative(),
  endSegmentId: z.number().int().nonnegative(),
  title: z.string().min(1),
  hook: z.string().min(1),
  reason: z.string(),
  scores: RubricSchema,
});

const MapResponseSchema = z.object({
  candidates: z.array(LlmCandidateSchema).max(3),
});

const RankResponseSchema = z.object({
  picks: z.array(z.number().int().nonnegative()),
});

// SPEC-060: stages/candidates.json
const CandidateSchema = LlmCandidateSchema.extend({
  id: z.string().regex(/^c\d{2,}$/),
  start: z.number().nonnegative(),
  end: z.number().nonnegative(),
  total: z.number().min(0).max(100),
  windowIndex: z.number().int().nonnegative(),
});

const CandidatesSchema = z.object({
  schemaVersion: z.literal(1),
  promptVersion: z.string(),
  provider: z.string(),
  model: z.string(),
  candidates: z.array(CandidateSchema),
  warnings: z.array(z.string()),
  usage: z.object({
    calls: z.number().int().nonnegative(),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
  }),
});

// SPEC-070: stages/clips.json
const ClipSchema = z.object({
  id: z.string(),
  candidateId: z.string(),
  start: z.number().nonnegative(),
  end: z.number().nonnegative(),
  firstSegment: z.number().int().nonnegative(),
  lastSegment: z.number().int().nonnegative(),
  title: z.string(),
  hook: z.string(),
  total: z.number(),
  flags: z.array(z.string()),
});

const ClipsSchema = z.object({
  schemaVersion: z.literal(1),
  clips: z.array(ClipSchema),
});

// SPEC-100: resources/presets.json
const PresetSchema = z.object({
  id: PresetIdSchema,
  label: z.string(),
  width: z.literal(1080),
  height: z.literal(1920),
  maxFps: z.union([z.literal(30), z.literal(60)]),
  minDurationSec: z.number().positive(),
  maxDurationSec: z.number().positive(),
  loudnessLUFS: z.number(),
  captionSafe: z.object({
    top: z.number().int().nonnegative(),
    bottom: z.number().int().nonnegative(),
    side: z.number().int().nonnegative(),
  }),
});

const PresetsFileSchema = z.object({
  schemaVersion: z.literal(1),
  checkedAt: z.string(), // when someone last verified the limits against the platforms
  presets: z.array(PresetSchema),
});

type Project = z.infer<typeof ProjectSchema>;
type StageName = z.infer<typeof StageNameSchema>;
type StageRecord = z.infer<typeof StageRecordSchema>;
type Manifest = z.infer<typeof ManifestSchema>;
type Probe = z.infer<typeof ProbeSchema>;
type Loudness = z.infer<typeof LoudnessSchema>;
type Word = z.infer<typeof WordSchema>;
type Transcript = z.infer<typeof TranscriptSchema>;
type Segment = z.infer<typeof SegmentSchema>;
type Segments = z.infer<typeof SegmentsSchema>;
type LlmCandidate = z.infer<typeof LlmCandidateSchema>;
type Candidate = z.infer<typeof CandidateSchema>;
type Candidates = z.infer<typeof CandidatesSchema>;
type Clip = z.infer<typeof ClipSchema>;
type Preset = z.infer<typeof PresetSchema>;
type PresetId = z.infer<typeof PresetIdSchema>;

export {
  CandidateSchema,
  CandidatesSchema,
  ClipSchema,
  ClipsSchema,
  LanguageCodeSchema,
  LlmCandidateSchema,
  LoudnessSchema,
  ManifestSchema,
  MapResponseSchema,
  PresetIdSchema,
  PresetSchema,
  PresetsFileSchema,
  ProbeSchema,
  ProjectSchema,
  RankResponseSchema,
  RubricSchema,
  SegmentSchema,
  SegmentsSchema,
  StageNameSchema,
  StageRecordSchema,
  TranscriptSchema,
  WordSchema,
};
export type {
  Candidate,
  Candidates,
  Clip,
  LlmCandidate,
  Loudness,
  Manifest,
  Preset,
  PresetId,
  Probe,
  Project,
  Segment,
  Segments,
  StageName,
  StageRecord,
  Transcript,
  Word,
};
