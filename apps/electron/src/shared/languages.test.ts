import { describe, expect, it } from "vitest";
import {
  checkTranscriptScript,
  countGraphemes,
  isLanguageCode,
  isSentenceEnd,
  LANGUAGE_CODES,
  LANGUAGES,
  normalizeText,
  truncateGraphemes,
} from "./languages";

const VIRAMAS = ["্", "्"]; // Bengali and Devanagari virama

describe("LANGUAGES registry", () => {
  it("has exactly bn, en and hi", () => {
    expect(Object.keys(LANGUAGES).sort()).toEqual(["bn", "en", "hi"]);
    expect([...LANGUAGE_CODES].sort()).toEqual(["bn", "en", "hi"]);
  });

  it("fills every field for every language", () => {
    for (const code of LANGUAGE_CODES) {
      const info = LANGUAGES[code];
      expect(info.code).toBe(code);
      expect(info.whisperCode).toBe(code);
      expect(info.nativeName.length).toBeGreaterThan(0);
      expect(info.sentenceEnders.length).toBeGreaterThan(0);
      expect(info.captionFont.family.length).toBeGreaterThan(0);
      expect(info.captionMaxGraphemesPerLine).toBeGreaterThan(0);
      expect(info.charsPerToken).toBeGreaterThan(0);
      expect(info.whisperPrompt.length).toBeGreaterThan(0);
      expect(info.continuationWords.length).toBeGreaterThan(0);
    }
  });

  it("shows native names in their own script", () => {
    expect(checkTranscriptScript(LANGUAGES.bn.nativeName, "bn")).toEqual({ ok: true });
    expect(checkTranscriptScript(LANGUAGES.hi.nativeName, "hi")).toEqual({ ok: true });
  });
});

describe("isLanguageCode", () => {
  it("accepts only bn, en, hi", () => {
    expect(isLanguageCode("bn")).toBe(true);
    expect(isLanguageCode("en")).toBe(true);
    expect(isLanguageCode("hi")).toBe(true);
    expect(isLanguageCode("ur")).toBe(false);
    expect(isLanguageCode("BN")).toBe(false);
    expect(isLanguageCode(undefined)).toBe(false);
  });
});

describe("normalizeText", () => {
  it("returns NFC", () => {
    const decomposed = "ক়"; // ক + nukta, a sequence NFC must leave stable
    expect(normalizeText(decomposed)).toBe(decomposed.normalize("NFC"));
    expect(normalizeText("Café")).toBe("Café");
  });

  it("keeps ZWJ and ZWNJ", () => {
    const rya = "র‍্যাব"; // র‍্যাব needs the ZWJ to render correctly
    expect(normalizeText(rya)).toContain("‍");
    expect(normalizeText("ক‌ষ")).toContain("‌");
  });

  it("collapses whitespace and trims", () => {
    expect(normalizeText("  আমি\t\n  ভালো   আছি  ")).toBe("আমি ভালো আছি");
  });
});

describe("graphemes", () => {
  it("counts conjuncts as one cluster", () => {
    expect(countGraphemes("ক্ষমা", "bn")).toBe(2);
    expect(countGraphemes("क्षमा", "hi")).toBe(2);
    expect(countGraphemes("hello", "en")).toBe(5);
  });

  it("never truncates inside a cluster", () => {
    const samples: Array<[string, "bn" | "hi"]> = [
      ["স্ট্রেস নিচ্ছি না", "bn"],
      ["ক্ষমা করবেন", "bn"],
      ["श्रद्धा से कहता हूँ", "hi"],
      ["क्षमा कीजिए", "hi"],
    ];
    for (const [text, lang] of samples) {
      for (let max = 1; max <= countGraphemes(text, lang); max += 1) {
        const cut = truncateGraphemes(text, max, lang);
        expect(VIRAMAS.includes(cut.slice(-1))).toBe(false);
        expect(text.startsWith(cut)).toBe(true);
      }
    }
  });

  it("returns the text unchanged when it already fits", () => {
    expect(truncateGraphemes("ক্ষমা", 10, "bn")).toBe("ক্ষমা");
  });
});

describe("checkTranscriptScript", () => {
  it("passes Bangla text for bn", () => {
    expect(checkTranscriptScript("আজকে আমরা ফ্রিল্যান্সিং নিয়ে কথা বলব।", "bn")).toEqual({ ok: true });
  });

  it("passes code-mixed Banglish for bn", () => {
    expect(checkTranscriptScript("আমি freelancing করি, it's great", "bn")).toEqual({ ok: true });
  });

  it("fails English-only text for bn and hi (wrong language chosen?)", () => {
    expect(checkTranscriptScript("Today we are going to talk about freelancing.", "bn").ok).toBe(false);
    expect(checkTranscriptScript("Today we are going to talk about freelancing.", "hi").ok).toBe(false);
  });

  it("fails Hindi text for bn", () => {
    expect(checkTranscriptScript("आज हम फ्रीलांसिंग के बारे में बात करेंगे।", "bn").ok).toBe(false);
  });

  it("passes Hindi and code-mixed Hinglish for hi", () => {
    expect(checkTranscriptScript("आज हम फ्रीलांसिंग के बारे में बात करेंगे।", "hi")).toEqual({ ok: true });
    expect(checkTranscriptScript("मैं freelancing करता हूँ, it's great", "hi")).toEqual({ ok: true });
  });

  it("fails Urdu-script output for hi", () => {
    expect(checkTranscriptScript("آج ہم فری لانسنگ کے بارے میں بات کریں گے۔", "hi").ok).toBe(false);
  });

  it("fails Bangla text for en", () => {
    expect(checkTranscriptScript("আজকে আমরা কথা বলব", "en").ok).toBe(false);
    expect(checkTranscriptScript("Nobody tells you this about your first client.", "en")).toEqual({ ok: true });
  });
});

describe("isSentenceEnd", () => {
  it("treats the danda as a sentence end in bn and hi only", () => {
    expect(isSentenceEnd("বলব।", "bn")).toBe(true);
    expect(isSentenceEnd("करेंगे।", "hi")).toBe(true);
    expect(isSentenceEnd("word।", "en")).toBe(false);
  });

  it("handles ordinary punctuation and closing quotes", () => {
    expect(isSentenceEnd("client.", "en")).toBe(true);
    expect(isSentenceEnd('great!"', "en")).toBe(true);
    expect(isSentenceEnd("কেন?", "bn")).toBe(true);
    expect(isSentenceEnd("আমি", "bn")).toBe(false);
  });
});
