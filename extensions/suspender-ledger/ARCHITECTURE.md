# Architecture — `@some-extension/suspender-ledger`

**Artifact:** Firefox MV3 browser extension — tab suspender.
**Docs home:** [Introduction](../../content/docs/Introduction.mdx)

---

## What it is

Watches open tabs and discards (suspends) idle ones after a configurable period to reclaim RAM. Never closes tabs — suspension is always reversible. A suspended tab keeps its position in the strip; restoring it reloads the original URL transparently.

---

## Entry points

| Surface | Entry | Output | Role |
|---|---|---|---|
| Service worker | `src/worker/worker.ts` | `worker.js` | Discard scheduling, prefs, context menu, keyboard commands |
| Content script | `src/content/watch.ts` | `watch.js` | Per-page activity detection (input/scroll/visibility) |
| Popup | `popup.html` → `src/popup/index.ts` | `popup.js` | Toolbar UI: per-tab actions, whitelist toggle, settings |
| Suspend page | `suspend.html` → `src/suspend/index.ts` | `suspend.js` | Stand-in page shown for navigated suspends; restores on click/Enter |

---

## Key abstractions

| Abstraction | Description |
|---|---|
| **Discard engine** | `src/worker/core/discard.ts` — the core logic: queries all tabs, filters by guards (audio, pinned, whitelist, form-dirty), sorts by last-access, discards the oldest N. |
| **Prefs** | `src/worker/core/prefs.ts` — typed preferences stored in `browser.storage.local`. Includes `period`, `number` (threshold), `whitelist`, `pinned`, `paused`. |
| **Startup** | `src/worker/core/startup.ts` — alarm registration, context menu construction, tab listener wiring on worker init. |
| **Suspend URL codec** | `src/worker/core/suspend-url.ts` (builder) + `src/suspend/params.ts` (parser) — hash-form URL: `suspend.html#title=…&uri=…`. Split deliberately to prevent Rollup from emitting a shared chunk that would inject ESM into the classic background script. |
| **Number mode** | `src/worker/modes/number.ts` — alternative mode: always keep exactly N most-recent tabs loaded; discard all others. |
| **Platform shim** | `src/lib/platform/firefox.ts` (aliased `@suspender/platform`) — isolates `browser.*` API differences so core logic is testable without a real browser. |
| **Message protocol** | `src/types/messages.ts` — typed, validated message types for every popup ↔ worker ↔ content boundary. |
| **Activity watcher** | `src/content/watch.ts` — listens for input events, scroll, and page visibility; reports `lastActive` timestamps to the worker via messaging. |

---

## Module map

```
src/
  worker/
    worker.ts                 — entry: wires all handlers, starts alarm
    core/
      discard.ts              — suspension engine
      prefs.ts                — typed preferences + storage
      startup.ts              — alarm + context menu init
      navigate.ts             — tab navigation helpers
      suspend-url.ts          — suspend URL builder (hash form)
      utils.ts                — tab query helpers
    menu.ts                   — context menu item construction
    modes/
      number.ts               — number-based keep-N mode
  content/
    watch.ts                  — activity detection content script
  popup/                      — popup UI
  suspend/
    index.ts                  — suspend page entry
    params.ts                 — suspend URL parser (hash form)
  lib/
    platform/
      firefox.ts              — browser API shim
    safe-url.ts               — URL validation (shared)
  types/
    messages.ts               — typed message protocol
suspend.html                  — suspend page HTML
popup.html                    — popup HTML
docs/
  design-notes.md             — known gaps, trade-offs, post-beta roadmap
```

---

## Critical invariants

| # | Invariant |
|---|---|
| S1 | The service worker is built as a **single flat bundle** (no code-splitting). Firefox MV3 background scripts cannot be ESM-imported. |
| S2 | The suspend URL codec is intentionally split across two modules (`suspend-url.ts` in worker, `params.ts` in suspend page) to prevent a shared Rollup chunk that would violate S1. |
| S3 | Suspension is always reversible — the extension never calls `browser.tabs.remove()`. |
| S4 | The active tab is never auto-suspended regardless of idle time. |
| S5 | Whitelist entries survive browser restart (stored via `browser.storage.local`); session-whitelist entries do not. |
| S6 | The suspend page badge favicon is always the extension's own inline SVG — never the original site's icon (AMO deceptive-pattern requirement). |

---

## ADRs

- [ADR 0001 — MV3 single-bundle constraint and Rollup chunk split](./docs/adr/0001-mv3-single-bundle-constraint.md)

## See also

- [README](./README.md) — full architecture table, MV3 constraints, build notes
- [Design notes](./design-notes.md) — known gaps (queue durability, battery gate, memory pressure)
- [AMO notes](./amo-notes.md)
- Issues: [#317 deceptive-pattern mitigation](https://github.com/paulgsc/some-ui/issues/317) · [#339 suspend URL fragility](https://github.com/paulgsc/some-ui/issues/339)
