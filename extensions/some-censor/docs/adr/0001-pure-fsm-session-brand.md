# ADR 0001 — Pure FSM with `SessionId` brand to prevent cross-session transitions

- **Status:** Accepted
- **Date:** 2026-06-28
- **Refs:** [#370 refactor PR](https://github.com/paulgsc/some-ui/pull/370)

## Context

The censor extension tracks a per-element view state (Masked → Meta → Title → Revealed). After a page navigation or extension reset, old state objects must not be applicable to new session state — a stale `Revealed` state from session A should not be usable to reveal a title in session B.

The naive solution is a runtime session-mismatch check, but this catches the error at runtime rather than at compile time.

## Decision

Introduce a branded `SessionId` opaque type. Every `ViewState` variant carries its `SessionId`. Transition functions are overloaded so the TypeScript compiler knows which source states are legal for each event — `applyClick(revealed, el)` is a compile error, not a silent no-op.

`applyReset()` is the only function that accepts a new `SessionId` (obtained from `mkSession()`). It cannot reuse the old session — the return type is `Masked` (not `ViewState`), so the old session is structurally gone after a reset.

`project()` has an exhaustive switch over `ViewState.kind`; adding a new state variant without updating `project()` is a compile error (`noImplicitReturns` + strict null checks).

## Trade-offs accepted

- More verbose type signatures (each transition function has multiple overloads).
- The `SessionId` brand requires a factory function (`mkSession()`); callers cannot construct a `SessionId` directly.

## Alternatives rejected

- **Runtime session check:** catches the bug at runtime instead of compile time. Rejected — we prefer catching this class of error at the type level.
- **Simple counter/timestamp session ID:** a `number` or `string` `SessionId` can be accidentally constructed; the brand prevents this. Rejected.
