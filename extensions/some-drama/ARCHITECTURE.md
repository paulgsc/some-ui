# Architecture — `@some-extension/drama` (some-drama)

**Artifact:** Firefox/Chrome browser extension — C-drama sentiment tracker.
**Docs home:** [Introduction](../../content/docs/Introduction.mdx)

---

## What it is

Captures timestamped emotional reactions while watching C-dramas. Detects drama context (title, episode, video timestamp) from the page and records reactions via a floating overlay UI with zero-friction capture flow.

---

## Entry points

| Surface | Entry | Role |
|---|---|---|
| Content script | `src/content/` | Mounts the floating reaction bar and quick-capture panel |
| Background | `src/background/background.ts` | Storage access and cross-tab coordination |
| Popup | `src/popup/` | Session ledger view |

---

## Key abstractions

| Abstraction | Description |
|---|---|
| **FSM** | Class-based FSM in `src/lib/content/` — currently couples transition methods with `browser.tabs.executeScript()` and `sendMsg()` calls directly (known Charter §2 violation; pure-FSM refactor tracked in [#343](https://github.com/paulgsc/some-ui/issues/343)). |
| **Reaction capture** | Two-second capture flow: emoji selection → optional intensity + notes → stored reaction record. |
| **Context detector** | `src/lib/content/` — extracts drama title, episode number, and video timestamp from the host page DOM. |
| **Storage** | Reaction records keyed by `(drama, episode, timestamp)`. Uses `browser.storage.local`. |
| **Domain classifier** | `src/lib/background/domain-classifier.ts` — identifies drama streaming pages where the extension should activate. |

---

## Module map

```
src/
  background/
    background.ts             — storage + cross-tab coordination
    domain-classifier.ts      — streaming site detection
    capture.ts                — reaction record persistence
    id.ts                     — reaction record ID generation
    types.ts                  — shared types
  content/                    — reaction bar + context detection
  lib/
    content/                  — FSM, context extractor, DOM utilities
    popup/                    — popup ledger view logic
  components/                 — React/Preact overlay components
  popup/                      — popup entry
```

---

## Critical invariants

| # | Invariant |
|---|---|
| D1 | Reaction records are timestamped to the video timestamp, not wall clock, so they survive page reload. |
| D2 | The floating reaction bar must not obstruct video playback controls. |

---

## Known gaps

- The FSM directly calls browser APIs from transition methods, violating Charter §2 (logic ≠ effects). Pure FSM refactor tracked in [#343](https://github.com/paulgsc/some-ui/issues/343).

## ADRs

- [ADR 0001 — Video-timestamp anchoring for reaction records](./docs/adr/0001-video-timestamp-anchoring.md)

## See also

- [README](./README.md)
- [Good-Citizen Charter](../common/GOOD_CITIZEN.md) §2 (logic ≠ effects)
