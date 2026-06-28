# ADR 0001 — Rust/WASM state machine for cube rotation scheduling

- **Status:** Accepted
- **Date:** 2026-06-22
- **Refs:** [some-conveyor README](../README.md) · [AMO notes — wasm-unsafe-eval](../amo-notes.md)

## Context

The conveyor strip requires deterministic, high-frequency rotation scheduling for many independent cube instances simultaneously. The scheduling logic involves geometric state (rotation axis, face sequence, dwell time) that is complex enough that a pure-JS implementation accumulated bugs under rapid event sequences. We needed a model where the scheduling invariants could be formally verified.

Additionally, the extension benefits from near-native performance for the geometry calculations (vertex transforms, face ordering) during the continuous scroll animation.

## Decision

Implement the cube rotation scheduler and geometry engine in Rust, compiled to WebAssembly. The Rust module owns the deterministic scheduling state; TypeScript calls into it via a typed WASM bridge (`wasm-bridge.ts`). All geometry calculations (vertex positions, face contents, rotation sequences) are computed on the Rust side.

This requires the `wasm-unsafe-eval` CSP directive in `manifest.json`, which is justified in `amo-notes.md` for AMO review.

## Trade-offs accepted

- Requires the `wasm-unsafe-eval` CSP exception, which AMO reviewers scrutinise. Must be explicitly justified per B6 requirement (#320).
- WASM adds ~50–200KB to the extension bundle depending on optimisation level.
- The Rust/WASM boundary adds a serialisation overhead for each call; complex geometry state should be kept on the Rust side and only results passed back to TypeScript.
- Debugging requires either Rust debugging tools or logging at the WASM boundary.

## Alternatives rejected

- **Pure TypeScript geometry engine:** prototyped but accumulated subtle rotation-sequence bugs under rapid cube lifecycle events. Rejected.
- **Web Worker for geometry:** still requires JS, doesn't benefit from Rust's type system for invariant enforcement. Rejected.
