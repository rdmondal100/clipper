# Highlight prompts (SPEC-060)

Prompts are versioned files, not strings in code. Changing a prompt means a new version file
(`map.v2.md`), so cached results rerun and snapshot tests show the diff.

Planned files:

- `map.v1.md` — per-window instructions: rubric, 0–3 candidates, segment IDs only, write title and
  hook in `{{promptName}}`, code-mixing is normal.
- `rank.v1.md` — pick the best `{{clipCount}}` with topic variety.
- `examples.bn.md`, `examples.en.md`, `examples.hi.md` — one short synthetic example each, so small
  models see the expected script.

Placeholders use `{{name}}`. Instructions are in English; transcripts stay in their own script
(SPEC-001 R15).
