# Architecture — `@some-extensions/schedule` (some-schedule)

**Artifact:** Firefox/Chrome browser extension — ambient music scheduler.
**Docs home:** [Introduction](../../content/docs/Introduction.mdx)

---

## What it is

An ambient music player driven by domain classification. Selects and schedules background audio based on the type of page the user is visiting. Features a well-designed 12-state pure FSM — currently with zero test coverage (highest-priority target for the Invariant Confidence Stack, [#341](https://github.com/paulgsc/some-ui/issues/341)).

---

## Entry points

| Surface | Entry | Role |
|---|---|---|
| Background | `src/background/` | Scheduling engine, domain classifier integration |
| Content script | `src/content/` | Page context detection |
| Popup | `src/popup/` | Playback controls and schedule view |

---

## Key abstractions

| Abstraction | Description |
|---|---|
| **12-state FSM** | Pure state machine in `src/shared/` — the highest-priority FSM in the codebase for testing ([#341](https://github.com/paulgsc/some-ui/issues/341)) because it is well-designed and pure, yet has zero test coverage. |
| **Domain classifier** | `src/background/` + `src/extractors/` — classifies the current page domain to select the appropriate ambient music track/category. |
| **Extractors** | `src/extractors/` — page content extractors that inform the scheduler (activity type, focus level, etc.). |
| **Shared state** | `src/shared/` — FSM types, transitions, and schedule data shared between background and popup. |

---

## Module map

```
src/
  background/
    background.ts             — scheduler entry, alarm management
    capture.ts                — activity capture
    domain-classifier.ts      — page type → music category
    types.ts                  — shared types
  content/                    — page context injection
  extractors/                 — per-page content extractors
  popup/                      — playback controls UI
  shared/                     — FSM types + 12-state machine
```

---

## Critical invariants

| # | Invariant |
|---|---|
| SC1 | The 12-state FSM transitions are pure — no browser API calls. |
| SC2 | Audio playback is always gated on user gesture or explicit activation (browser autoplay policy). |

---

## Known gaps

- The 12-state FSM has zero test coverage. This is the highest-friction-to-reward testing target in the codebase; tests are tracked in [#344](https://github.com/paulgsc/some-ui/issues/344) and [#342](https://github.com/paulgsc/some-ui/issues/342).

## ADRs

- [ADR 0001 — 12-state FSM for music scheduling](./docs/adr/0001-12-state-music-fsm.md)

## See also

- Issues: [#341 Invariant Confidence Stack epic](https://github.com/paulgsc/some-ui/issues/341) · [#344 transition graph exhaustion tests](https://github.com/paulgsc/some-ui/issues/344)
- [Good-Citizen Charter](../common/GOOD_CITIZEN.md)
