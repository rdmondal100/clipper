# SPEC-130: IPC contract

| | |
|---|---|
| **Status** | Draft (the pattern is fixed; the channel list grows with M3–M5) |
| **Milestone** | M3 |
| **Depends on** | SPEC-002 |
| **Code** | `src/shared/types.ts`, `src/main/ipc.ts`, `src/main/utils/ipc.ts`, `src/preload/index.ts`, `src/main/protocol.ts` |

## Pattern (same as WorkPulse — fixed)

- Every request/response channel is a key of `EventPayloadMapping` in `src/shared/types.ts` with
  `{ request; response }` types; every push channel is a key of `EventPushMapping`.
- Main registers handlers only in `src/main/ipc.ts` with `ipcMainHandle` (which validates the
  sender frame). The preload exposes one object, `window.clipper`, typed as `ClipperApi`.
- Responses that can fail are results: `{ ok: true; … } | { ok: false; message: string }`.
- Channel names: `area:action`, kebab-case actions (`project:create`, `clip:re-render`).

## Planned channels

| Channel | Request → Response | Milestone |
|---|---|---|
| `app:get-info` | – → `{ version, isDev }` | M0 ✔ (starter) |
| `dialog:pick-video` | – → `{ ok, path, name } ` | M3 |
| `project:list` / `project:get` | – / `{ id }` → projects / project | M3 |
| `project:create` | `{ sourcePath, language, settings }` → `{ ok, project }` | M3 |
| `project:delete` / `project:relink` | `{ id }` / `{ id, path }` → result | M3 |
| `job:start` / `job:cancel` / `job:list` | … | M3 |
| `clip:list` / `clip:update` / `clip:re-render` / `clip:export` / `clip:reveal` | … | M4 |
| `settings:get` / `settings:update` | … | M3 |
| `provider:test` / `provider:set-key` / `provider:clear-key` | … | M3 |
| `hardware:get-profile` | – → `{ profile, gpu, ramGb, encoders }` | M3 |
| **push** `job:progress` | `{ jobId, stage, progress, note? }` | M3 |
| **push** `job:changed` | `Job` | M3 |

## The `media://` protocol

- The sandboxed renderer can't load `file://` videos. `protocol.ts` registers `media://` with
  `protocol.handle`, serving files **only** from registered project folders (and the fonts folder).
- Paths are resolved and checked to stay inside an allowed folder (no `..` escapes).
- Range requests must work so the player can seek in multi-hour proxies.
- CSP in `index.html` adds `media-src media:` and `img-src media:`.

## Acceptance criteria (to finalize)

- [ ] Every channel in `ipc.ts` exists in `EventPayloadMapping` and in the preload (compile-time).
- [ ] `media://` refuses a path outside project folders (test with `..` and absolute paths).
- [ ] Seeking to the last minute of a 2-hour proxy starts playback within 1 s.
