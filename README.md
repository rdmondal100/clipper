# Clipper

Turn long videos into short vertical clips — in **Bangla, English and Hindi** — on your own
computer, with your own AI (local Ollama or your API key).

> Working name. Status: M0 (foundation). See [docs/product/roadmap.md](docs/product/roadmap.md).

## Start here

1. Read [docs/product/vision.md](docs/product/vision.md) — what and why.
2. Read [docs/README.md](docs/README.md) — how spec-driven development works here, and the spec index.
3. AI agents: read [CLAUDE.md](CLAUDE.md) first.

## Setup (Windows, Node 22+)

```bash
cd apps/electron
npm install
npm run typecheck && npm test
npm run check:bins     # tells you which tools to put in resources/bin
npm run dev
```

## First sessions with the agent (one prompt per session)

1. `Implement SPEC-002. Run npm install, typecheck, test and dev; fix version drift. Follow CLAUDE.md.`
2. `Implement SPEC-010, tests first from the acceptance criteria.`
3. `Implement SPEC-020 with fake stages, tests first.`
4. `Finish the M0 part of SPEC-160 so the CLI creates a project folder.`
5. `Implement SPEC-050 (segment).` — pure functions, the easiest real stage.
6. Then SPEC-030 → 040 → 110 → 060 → 070 → 090 → 100, in roadmap order.

Before each one, ask the agent to review the spec for gaps first if it's still `Draft`.

## Repo

```
CLAUDE.md            rules for AI agents (read every session)
docs/
  product/           vision, roadmap
  specs/             one spec per feature (SPEC-NNN)
  decisions/         ADRs
  architecture.md    processes, pipeline, data
apps/electron/       the desktop app (same layout as the WorkPulse agent)
```
# clipper
