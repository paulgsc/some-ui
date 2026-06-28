# ADR 0001 — 12-state FSM for music scheduling

- **Status:** Accepted
- **Date:** 2026-06-22

## Context

The ambient music scheduler needs to respond to many concurrent signals: page type changes, user focus, playback errors, network state, user preferences, and explicit overrides. An ad-hoc if/else implementation of this logic accumulated edge cases and silent no-ops when state combinations were missed.

## Decision

Model the scheduler as an explicit 12-state FSM with typed state variants and pure transition functions. The FSM lives in `src/shared/` and is shared between the background script and popup. All state is in the FSM; side effects (audio playback, API calls) are triggered by the controller in response to state transitions.

The 12 states cover: `Idle`, `Detecting`, `Selected`, `Buffering`, `Playing`, `Paused`, `Error`, `Retrying`, `UserOverride`, `Suspended`, `FocusLost`, `NetworkLost`.

## Trade-offs accepted

- 12 states × N events = large transition table. Some transitions are intentionally `null` (no-ops for invalid combinations), which must be documented clearly.
- The FSM is currently untested (zero test files). This is the highest-priority target for the Invariant Confidence Stack (#341–#346) because the FSM is already pure — tests can be written without a browser environment.

## Alternatives rejected

- **Ad-hoc if/else with boolean flags:** the original implementation; accumulated silent no-ops and edge cases on race conditions. Replaced by the FSM.
- **XState or similar FSM library:** adds a runtime dependency; the FSM is simple enough that a hand-rolled implementation is more transparent. Deferred until complexity warrants it.
