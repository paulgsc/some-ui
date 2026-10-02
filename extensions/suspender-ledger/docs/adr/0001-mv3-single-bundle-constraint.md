# ADR 0001 — MV3 single-bundle constraint and Rollup/Vite chunk split

- **Status:** Accepted
- **Date:** 2026-06-24
- **Refs:** [suspender-ledger build](../../README.build.md)

## Context

Firefox Manifest V3 background scripts must be a single self-contained file — they cannot use `import()` or `import` statements at the module level when loaded as a classic script. Rollup/Vite's default behaviour is to emit shared chunks when two entry points share dependencies, which would produce ESM `import` statements in the generated bundle — breaking the MV3 service worker.

The suspend URL codec (`suspend-url.ts` in the worker, `params.ts` in the suspend page) is the most obvious shared boundary: both the worker and the suspend page need to build and parse the same URL format.

## Decision

- Configure Vite with `output.manualChunks: {}` (or equivalent) so the worker entry point is always a single flat bundle.
- Deliberately split the suspend URL codec into two **separate** modules — `src/worker/core/suspend-url.ts` (builder) and `src/suspend/params.ts` (parser) — with no shared import between them. They share the URL format specification via documentation and a round-trip test, not shared code.
- The round-trip test (`suspend-url.test.ts`) asserts that build → parse produces the original values, keeping the two modules in sync without a shared import.

## Trade-offs accepted

- The URL format is documented in two places (builder and parser comments) instead of one. This is the cost of avoiding the shared chunk.
- A change to the URL format requires updating both modules and the test. The test enforces this — a change to one without the other will fail CI.

## Alternatives rejected

- **Shared URL codec module imported by both:** this would cause Rollup to emit a shared chunk, injecting an ESM `import` into the worker bundle and breaking the MV3 service worker. Rejected.
- **Encode the URL format in a `.json` config file:** adds complexity without solving the fundamental issue; Rollup still emits a shared chunk for the `.json` import. Rejected.
