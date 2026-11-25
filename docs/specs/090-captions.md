# SPEC-090: Captions

| | |
|---|---|
| **Status** | Ready (M1 part); M2 part Draft |
| **Milestone** | M1 (static lines), M2 (word highlight, style presets) |
| **Depends on** | SPEC-001, SPEC-040, SPEC-070, SPEC-170 (fonts, libass) |
| **Code** | `src/main/pipeline/captions/` (`pages.ts`, `ass.ts`) |

## Goal

Burned-in captions that look right in Bangla, Hindi and English — no broken conjuncts, no tofu
boxes, readable on a phone, clear of platform buttons.

## Output

`stages/captions/<clipId>.ass` (Advanced SubStation Alpha), rendered by ffmpeg's libass in SPEC-100.

## Rules

**Building caption pages**

- R1. Words come from the transcript inside the clip range (times shifted to clip time). Edited
  captions from SPEC-150 override them.
- R2. A page has at most 2 lines; each line at most `LANGUAGES[lang].captionMaxGraphemesPerLine`
  graphemes. A word longer than a line gets a line to itself — words are never split (SPEC-001 R6).
- R3. Start a new page at a sentence end, at a pause ≥ 0.4 s, or when a page has shown for 2.5 s.
- R4. Lines are balanced (the break goes where the two lines are closest in length).

**ASS file**

- R5. `PlayResX 1080`, `PlayResY 1920`. Font = `LANGUAGES[lang].captionFont` (family name must match
  the font file's internal name). Bold, size 72, white fill, black outline 6, no shadow,
  bottom-center alignment, `MarginV` = preset's caption safe bottom (SPEC-100).
- R6. Escape `{`, `}` and `\` in text; line breaks are `\N`.
- R7. **M2 word highlight:** one dialogue event per word interval showing the whole page, with the
  active word coloured by an override tag. Override tags may only be placed **between words**,
  never inside one (a style change splits shaping runs and breaks conjuncts).
- R8. **M2 style presets:** "Clean" (M1 look), "Bold pop" (yellow active word), "Boxed" (dark box
  behind text). Stored as JSON so new presets don't need code.

## Language notes

- Fonts cover native script + Latin, so Banglish/Hinglish lines render in one font (SPEC-001 R11).
- Line length is measured in graphemes, not characters.
- Bangla/Hindi need more vertical space (matras above and below): line spacing +15% for bn/hi.

## Render test strings

| Lang | Text |
|---|---|
| bn | ক্ষমা করবেন, আমি স্ট্রেস নিচ্ছি না। freelancing শুরু করুন |
| hi | क्षमा कीजिए, श्रद्धा से कहता हूँ। freelancing शुरू करें |
| en | Nobody tells you this about your first client. |

## Acceptance criteria

M1:

- [ ] Page builder never splits a word and respects the per-language line limit (unit tests in bn,
      en, hi, including a very long Bangla word).
- [ ] ASS output escapes special characters and parses back (round-trip test of our own parser).
- [ ] Render test: one 1080×1920 frame per language with the test strings, checked by eye once
      (conjuncts intact, Latin words in the same font, no boxes), then stored as a golden PNG.
      The integration test compares new renders with the golden PNG (≤ 2% pixel difference) and
      is skipped when ffmpeg isn't available.

M2:

- [ ] Word highlight follows word timing within one frame (33 ms at 30 fps).
- [ ] Highlighting never changes how a word is shaped (golden PNG of a highlighted Bangla word).

## Open questions

- Final fonts (Hind Siliguri / Hind / Montserrat vs Noto) after the render test — update SPEC-001.
- Caption position: bottom safe zone vs upper third (some creators prefer captions mid-screen).
