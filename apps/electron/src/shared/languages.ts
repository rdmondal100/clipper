// SPEC-001: the only place that knows per-language values. Stages ask this registry; they never
// branch on language codes themselves.

const LANGUAGE_CODES = ["bn", "en", "hi"] as const;

type LanguageCode = (typeof LANGUAGE_CODES)[number];

// ISO 15924 script codes for the scripts we count in transcripts
type ScriptCode = "Beng" | "Deva" | "Latn" | "Arab" | "Other";

type WhisperModel = "base" | "small" | "medium" | "large-v3-turbo" | "large-v3";

type LanguageInfo = {
  code: LanguageCode;
  name: string; // English name, for logs and prompts
  nativeName: string; // shown in the UI, always in its own script
  whisperCode: LanguageCode;
  script: Exclude<ScriptCode, "Arab" | "Other">;
  sentenceEnders: readonly string[];
  captionFont: { family: string; file: string }; // candidates until the SPEC-090 render test
  captionMaxGraphemesPerLine: number; // tuned in M2
  charsPerToken: number; // conservative LLM budget estimate, calibrated in M1
  recommendedWhisperModel: WhisperModel; // provisional until SPEC-180
  promptName: string; // how prompts name the language
  whisperPrompt: string; // nudges Whisper to punctuate (SPEC-040 R2)
  continuationWords: readonly string[]; // clip openings that sound mid-thought (SPEC-070 R5)
  hallucinations: readonly string[]; // phrases Whisper invents in silence (SPEC-040 R8)
};

const LANGUAGES: Record<LanguageCode, LanguageInfo> = {
  bn: {
    code: "bn",
    name: "Bangla",
    nativeName: "বাংলা",
    whisperCode: "bn",
    script: "Beng",
    sentenceEnders: ["।", "॥", "?", "!", "."],
    captionFont: { family: "Hind Siliguri", file: "HindSiliguri-Bold.ttf" },
    captionMaxGraphemesPerLine: 16,
    charsPerToken: 1.0,
    recommendedWhisperModel: "large-v3-turbo",
    promptName: "Bangla (Bengali script)",
    whisperPrompt: "আজকের আলোচনায় আমরা কথা বলব।",
    continuationWords: ["আর", "কিন্তু", "তো", "তাহলে", "মানে"],
    hallucinations: [], // fill from SPEC-180 findings
  },
  en: {
    code: "en",
    name: "English",
    nativeName: "English",
    whisperCode: "en",
    script: "Latn",
    sentenceEnders: [".", "?", "!", "…"],
    captionFont: { family: "Montserrat ExtraBold", file: "Montserrat-ExtraBold.ttf" },
    captionMaxGraphemesPerLine: 20,
    charsPerToken: 3.5,
    recommendedWhisperModel: "small",
    promptName: "English",
    whisperPrompt: "Today we're going to talk about this.",
    continuationWords: ["and", "but", "so", "because", "then"],
    hallucinations: ["Thank you for watching.", "Thanks for watching!", "Subtitles by"],
  },
  hi: {
    code: "hi",
    name: "Hindi",
    nativeName: "हिन्दी",
    whisperCode: "hi",
    script: "Deva",
    sentenceEnders: ["।", "॥", "?", "!", "."],
    captionFont: { family: "Hind", file: "Hind-Bold.ttf" },
    captionMaxGraphemesPerLine: 16,
    charsPerToken: 1.2,
    recommendedWhisperModel: "large-v3-turbo",
    promptName: "Hindi (Devanagari script)",
    whisperPrompt: "आज की चर्चा में हम बात करेंगे।",
    continuationWords: ["और", "लेकिन", "तो", "क्योंकि", "मतलब"],
    hallucinations: [], // fill from SPEC-180 findings
  },
};

function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === "string" && (LANGUAGE_CODES as readonly string[]).includes(value);
}

// NFC, whitespace collapsed; ZWJ (U+200D) and ZWNJ (U+200C) are not whitespace, so they survive
function normalizeText(text: string) {
  return text.normalize("NFC").replace(/\s+/gu, " ").trim();
}

// one segmenter per language; modern ICU keeps Bengali/Devanagari conjuncts in one cluster
const segmenters = new Map<LanguageCode, Intl.Segmenter>();

function graphemes(text: string, lang: LanguageCode) {
  let segmenter = segmenters.get(lang);
  if (!segmenter) {
    segmenter = new Intl.Segmenter(lang, { granularity: "grapheme" });
    segmenters.set(lang, segmenter);
  }
  return Array.from(segmenter.segment(text), (part) => part.segment);
}

function countGraphemes(text: string, lang: LanguageCode) {
  return graphemes(text, lang).length;
}

// cut on cluster boundaries only, so a conjunct is never left half-drawn
function truncateGraphemes(text: string, max: number, lang: LanguageCode) {
  const parts = graphemes(text, lang);
  return parts.length <= max ? text : parts.slice(0, Math.max(0, max)).join("");
}

const SCRIPT_TESTS: Array<[Exclude<ScriptCode, "Other">, RegExp]> = [
  ["Beng", /\p{Script=Bengali}/u],
  ["Deva", /\p{Script=Devanagari}/u],
  ["Latn", /\p{Script=Latin}/u],
  ["Arab", /\p{Script=Arabic}/u],
];

// share of letters per script; vowel signs (marks) count too, otherwise Bangla/Hindi words look
// far shorter than English ones. Digits, punctuation, spaces and ZWJ/ZWNJ are ignored
function scriptShares(text: string): Record<ScriptCode, number> {
  const counts: Record<ScriptCode, number> = { Beng: 0, Deva: 0, Latn: 0, Arab: 0, Other: 0 };
  let total = 0;
  for (const char of text) {
    if (!/[\p{L}\p{M}]/u.test(char)) continue;
    total += 1;
    const match = SCRIPT_TESTS.find(([, test]) => test.test(char));
    counts[match ? match[0] : "Other"] += 1;
  }
  if (total === 0) return counts;
  for (const key of Object.keys(counts) as ScriptCode[]) counts[key] /= total;
  return counts;
}

type ScriptCheck = { ok: true } | { ok: false; reason: string };

// SPEC-001 R13: does the transcript look like the project language? thresholds are tuned in SPEC-180
function checkTranscriptScript(text: string, lang: LanguageCode): ScriptCheck {
  const shares = scriptShares(text);
  const native = LANGUAGES[lang].script;
  const percent = (value: number) => `${Math.round(value * 100)}%`;

  if (lang === "en") {
    return shares.Latn >= 0.9
      ? { ok: true }
      : { ok: false, reason: `Only ${percent(shares.Latn)} of letters are Latin` };
  }
  // Latin is allowed alongside the native script: English words in Banglish/Hinglish are normal.
  // So we check (a) non-Latin text is in the right script, (b) there is enough native text at all
  const nonLatin = 1 - shares.Latn;
  const foreign = nonLatin - shares[native];
  if (nonLatin > 0 && foreign / nonLatin > 0.2) {
    return { ok: false, reason: `${percent(foreign / nonLatin)} of non-Latin letters are in another script` };
  }
  if (shares[native] < 0.15) {
    return { ok: false, reason: `Only ${percent(shares[native])} of letters are in ${LANGUAGES[lang].promptName}` };
  }
  return { ok: true };
}

// a word ends a sentence when its last visible character is one of the language's enders
function isSentenceEnd(word: string, lang: LanguageCode) {
  const trimmed = word.trim().replace(/["'”’»)\]]+$/u, "");
  const last = trimmed.slice(-1);
  return last !== "" && LANGUAGES[lang].sentenceEnders.includes(last);
}

export {
  checkTranscriptScript,
  countGraphemes,
  isLanguageCode,
  isSentenceEnd,
  LANGUAGE_CODES,
  LANGUAGES,
  normalizeText,
  scriptShares,
  truncateGraphemes,
};
export type { LanguageCode, LanguageInfo, ScriptCheck, ScriptCode, WhisperModel };
