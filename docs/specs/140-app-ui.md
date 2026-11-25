# SPEC-140: App UI — projects, new project, progress

| | |
|---|---|
| **Status** | Draft |
| **Milestone** | M3 |
| **Depends on** | SPEC-120, SPEC-130, SPEC-155 |
| **Code** | `src/renderer/src/pages/{Projects,NewProject,ProjectProgress}.tsx`, `store/`, `hooks/` |

## Goal

Someone who has never seen the CLI can go from a video file to finished clips.

## Screens (to refine with mockups)

1. **Projects** — cards: thumbnail, name, language badge (বাংলা / English / हिन्दी), duration, status
   (processing x%, ready with N clips, failed, source missing), last opened. Empty state with a big
   "New project" button and drag-and-drop target.
2. **New project** — one screen:
   - video: drop a file / browse (URL import arrives with SPEC-190);
   - **language: required**, three big buttons বাংলা · English · हिन्दी, pre-selected with the last
     used, plus "Detect for me" (SPEC-001 R2);
   - platforms (checkboxes, from presets), number of clips (5–20, default 10), length range
     (default 20–60 s), content type (optional);
   - shows the AI setup in use and its privacy label (SPEC-110 R8), with a link to change it;
   - shows an estimate: "About 25 min on this PC" (from the hardware profile, SPEC-155).
3. **Progress** — stage list with ticks, current stage progress, overall bar, ETA, cancel; warnings
   (e.g. script check) shown inline; "Open review" when done.

## Rules (draft)

- State mirrors main via stores + sync hooks (`useJobsSync`, `useProjectsSync`), WorkPulse style.
- All strings from `lib/strings.ts` (SPEC-001 R18).
- Language names always shown in their own script.
- Every Bangla/Hindi text element sets `lang` (SPEC-001 R17).

## Acceptance criteria (to finalize)

- [ ] New project can't start without a language.
- [ ] Closing the window during processing keeps the job running (tray or minimized) — decide.
- [ ] A failed job shows the stage, the message and a "Retry" that resumes (not restarts).
