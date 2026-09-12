# Architecture — `@some-extension/censor` (some-censor)

**Artifact:** Firefox/Chrome browser extension — YouTube title censor.
**Docs home:** [Introduction](../../content/docs/Introduction.mdx)

---

## What it is

Censors YouTube video titles in the tab strip, thumbnails, and search results until the user deliberately unlocks a title via keyboard shortcut. Uses a pure typed FSM with zero side effects in the transition functions so the state machine contract can be tested independently of the browser.

---

## Entry points

| Surface | Entry | Role |
|---|---|---|
| Content script | `src/content/` | Mounts the censor overlay, drives the FSM |
| Background | `src/background/` | Storage access, cross-tab coordination |

---

## Key abstractions

| Abstraction | Description |
|---|---|
| **FSM** | `src/lib/content/fsm.ts` — pure transition functions. Four states: `Masked → Meta → Title → Revealed`. Each transition is an overloaded function; calling `applyClick(revealed, el)` is a compile error. |
| **SessionId** | `src/lib/content/session.ts` — opaque branded type. Every state carries its own `SessionId`; cross-session transitions cannot be constructed. `applyReset()` requires a caller-supplied new `SessionId`. |
| **Observer** | `src/lib/content/observer.ts` — MutationObserver that detects new YouTube title nodes and applies the initial `Masked` state. |
| **Controller** | `src/lib/content/controller.ts` — wires observer, keybinding events, and DOM handle into the FSM; owns the `ViewState` reference. |
| **DOM handle** | `src/lib/content/dom-handle.ts` — the DOM mutation interface (mask/reveal HTML elements). Pure renderer — no FSM state knowledge. |
| **Keybindings** | Commons keybinding typestate (`@some-extension/common`) — adopted in the refactor landed via [#370](https://github.com/paulgsc/some-ui/pull/370). `some-censor` is the reference implementation. |
| **Commands** | `src/lib/content/commands.ts` — command registry wired to the commons typestate. |
| **Click gate** | `src/lib/content/click-gate.ts` — prevents accidental title unlock from mis-clicks; requires a deliberate gesture. |

---

## Module map

```
src/
  background/                 — storage coordination
  content/                    — content script entry
  lib/
    content/
      fsm.ts                  — pure FSM + state variants
      session.ts              — SessionId opaque type
      observer.ts             — MutationObserver for new title nodes
      controller.ts           — FSM wiring (observer + keybinding + DOM)
      dom-handle.ts           — DOM mutation renderer
      commands.ts             — command registry
      click-gate.ts           — deliberate-gesture guard
      events.ts               — event helpers
      extract/                — YouTube DOM extractors (meta, title, duration)
      debug.ts                — debug mode helpers
    platform/                 — browser API shims
  types/                      — shared types
```

---

## Critical invariants

| # | Invariant |
|---|---|
| C1 | FSM transition functions are pure — no browser API calls, no DOM mutations. Side effects live in `controller.ts` and `dom-handle.ts` only. |
| C2 | Every FSM state carries a `SessionId`; cross-session transitions are a compile-time error. |
| C3 | `applyReset()` is the only function that accepts a new `SessionId`; it always returns `Masked`, never the prior state variant. |
| C4 | `project()` in `fsm.ts` has an exhaustive switch over `ViewState.kind`; a missing branch is a compile error (`noImplicitReturns` + strict null checks). |
| C5 | The commons keybinding typestate is the sole definition of `ModifierSet` and `KeyBinding` for this workspace — no local copies. |

---

## ADRs

- [ADR 0001 — Pure FSM with SessionId brand to prevent cross-session transitions](./docs/adr/0001-pure-fsm-session-brand.md)

## See also

- Issues: [#277 keybinding adoption](https://github.com/paulgsc/some-ui/issues/277) · [#370 refactor PR](https://github.com/paulgsc/some-ui/pull/370)
- [Good-Citizen Charter](../common/GOOD_CITIZEN.md)
