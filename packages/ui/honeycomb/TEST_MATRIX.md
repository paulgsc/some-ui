# Test-need matrix: honeycomb + workspace deps (wasm crates included)

> Recon only — no code or tests were touched by this document. It is the
> prerequisite inventory for the `honeycomb` lint fix (48 problems: 43 errors,
> 5 warnings) so that lint/typecheck-driven edits can be checked against
> behavioral tests, not just `tsc`/`eslint` shape checks.
>
> Source issue: [#467](https://github.com/paulgsc/some-ui/issues/467)

## Context

Per the canonical-tests methodology agreed on for this codebase:

> Does this module have behavior that can accidentally change while still
> compiling? If yes, it needs behavioral tests. If a module is a thin
> wrapper or pure integration glue, tests would just duplicate the
> implementation — skip it.

This inventories every file in `packages/ui/honeycomb` and the workspace
dependencies it actually imports (`maishatu-fetch-kit`, `some-hexagon`,
`hangul-game-core`, `some-ui-shared`), classifies each by behavioral risk,
and states a verdict against the null hypothesis **"no test is needed."**
`some-ui-utils` is listed as a honeycomb dependency in `package.json` but is
not imported anywhere in `src/` — excluded from the matrix as dead weight,
not a test gap.

**Categories:**

- **Pure behavior** — standalone logic/state machines, cheap and valuable to unit test.
- **Thin wrapper** — trivial delegation; a test would just re-assert the implementation.
- **Integration** — correctness depends on DOM/browser/network/WASM runtime; better suited to e2e, Chromatic, or `wasm-bindgen-test` than plain unit tests.

Existing test infra already in place, no new setup needed: `vitest` +
`@testing-library/react` (`packages/ui/honeycomb/vitest.config.ts`),
Storybook + Chromatic (multiple `*.stories.tsx` already present), and
`cargo test` wired into `.github/workflows/_rust-ci.yml` for the Rust crates.

## Headline findings

1. **`lib/hangul/keyboard-input-manager.ts` — the exact class used as the
   worked example in the test-strategy discussion that motivated this recon —
   has zero direct unit tests.** The only place it's exercised is
   `hooks/use-keyboard-input/index.test.ts`, which mocks `keyboardManager`
   entirely (`addKey: vi.fn()`, `clearBuffer: vi.fn()`), so the real
   `addKey`/`getBuffer`/`shouldClearBuffer` timeout-boundary logic is never
   actually run by CI.
2. **`crates/hangul-game-core/src/internal/engine.rs` (`GameEngine`, 370
   lines) — the entire matching/ambiguity/difficulty state machine — has
   zero tests.** Only 3 smoke tests exist in `lib.rs` against the thin wasm
   wrapper (`HangulGameCore`), covering construction and one spawn call.
   `process_input`'s three-way branch (exact match / ambiguous / prefix /
   miss), `handle_match`'s streak-bonus and difficulty-speedup math, and
   `tick`'s expiry-penalty logic are all unverified. Highest-risk file in the
   whole recon.
3. **`lib/hangul/wasm-game-bridge.ts` (`WasmGameBridge`, 364 lines)** has one
   test file, but it only asserts the `HANGUL_GRID_RADIUS`/`_CELL_COUNT`
   constants — none of the class's actual logic (`statusEquals` dedup guard,
   cube-coordinate `generateCellIds` enumeration, `createDisplayCharacter`
   mapping fallback, `getStats` accuracy math) is under test.
4. **`maishatu-fetch-kit/src/lib/fetch-client.ts` (395 lines)** has no test
   file and no `test` script in its `package.json` at all. It contains real
   retry/backoff math, content-type branching, and `ApiError` classification
   — all pure, all mockable via global `fetch`, all currently unverified.
5. **`use-game-loop.ts` and `use-game-timer.ts`** are siblings of
   `use-keyboard-input.ts` (same event-batch-processing pattern) which _does_
   have thorough tests, but neither has any test coverage itself.

## Matrix: `packages/ui/honeycomb/src`

### Hooks

| File                                | Category                                                                                          | Existing tests                                                                           | Verdict                                                                                                                      | Suggested test                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `hooks/use-keyboard-input/index.ts` | Pure behavior (event-batch reducer)                                                               | `index.test.ts` — thorough (listener lifecycle, key filtering, all `GameEvent` branches) | **No further action** — already satisfied                                                                                    | —                                                                          |
| `hooks/use-game-loop.ts`            | Pure behavior (spawn/update event-batch reducer, `timeRemaining` decay math, `calculateAccuracy`) | None                                                                                     | **Needs tests**                                                                                                              | Unit (renderHook + fake timers), mirror `use-keyboard-input/index.test.ts` |
| `hooks/use-game-timer.ts`           | Pure behavior (once-only start/terminal-fire guards via refs, `useSyncExternalStore` wiring)      | None                                                                                     | **Needs tests**                                                                                                              | Unit (renderHook, mock `subscribeToStatus`/`getStatusSnapshot`)            |
| `hooks/use-game-audio.ts`           | Integration (imperative `HTMLAudioElement` side effects)                                          | None                                                                                     | Null hypothesis holds for exhaustive coverage; a thin smoke test is worth it for the `enabled`/no-audio-found guard branches | Light unit test for guard branches only                                    |
| `hooks/use-hangul-wasm.ts`          | Pure behavior (load/init state machine) wrapping an integration boundary                          | None                                                                                     | **Needs tests** for the state machine                                                                                        | Unit (renderHook, mock `loadHangulWasm`)                                   |
| `hooks/use-hexgrid-wasm.ts`         | Pure behavior (zod validation branch, radius calc) wrapping an integration boundary               | None                                                                                     | **Needs tests** for the validation/error branches                                                                            | Unit (renderHook, mock `some-hexagon`'s `WasmHexGrid`)                     |

### Lib

| File                                   | Category                                                                                                              | Existing tests                                                   | Verdict                                                              | Suggested test                                                                                                                                 |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/hangul/keyboard-input-manager.ts` | Pure behavior (buffer timeout/ordering contract — see Finding 1)                                                      | None (mocked away in the one place it's used)                    | **Needs tests, highest priority in this directory**                  | Unit — the cases already sketched in the discussion (`preserves insertion order`, `drops expired keys`, `reports timeout based on oldest key`) |
| `lib/hangul/wasm-game-bridge.ts`       | Pure behavior (`statusEquals`, `generateCellIds`, `createDisplayCharacter`, `getStats`) around a thin wasm-call layer | `wasm-game-bridge.test.ts` — only covers grid-capacity constants | **Needs tests** for the class methods                                | Unit, mock `HangulGameCore`                                                                                                                    |
| `lib/hangul/hangul-wasm-runtime.ts`    | Integration (singleton loader, race-safety via `loadPromise`)                                                         | None                                                             | Null hypothesis mostly holds; the race-guard is worth 1-2 unit tests | Small unit test with mocked dynamic import                                                                                                     |

### Utils

| File                               | Category                                                 | Existing tests | Verdict                                                                                              | Suggested test                                   |
| ---------------------------------- | -------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `utils/hangul-keyboard-mapping.ts` | Pure behavior (`isCorrectKey`, reverse-map construction) | None           | **Needs tests** (a duplicate/typo'd `hangul` key would silently break matching)                      | Unit, table-driven over `ALL_MAPPINGS`           |
| `utils/hexagon-math.ts`            | Pure behavior (radius↔cell-count round-trip)            | None           | **Needs tests** (boundary/rounding regressions are exactly the "compiles fine, silently wrong" case) | Unit, round-trip property test across radii 0-10 |

### Components

| File                                                                                                                                                                                         | Category                                                        | Existing tests                | Verdict                                                                                               | Suggested test                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------- |
| `components/hex-grid/index.tsx`                                                                                                                                                              | Pure behavior (`contentMap`/`mergedCells` memo) in an SVG shell | `index.stories.tsx`           | Null hypothesis holds for rendering; memo merge logic is a small carve-out worth testing if extracted | Chromatic covers the rest         |
| `components/neuron/index.tsx`                                                                                                                                                                | Integration (canvas/animation-frame sim)                        | `index.stories.tsx`           | Null hypothesis holds                                                                                 | Chromatic (already present)       |
| `components/hangul-hex-grid/overlay/index.tsx`, `song-hex-grid/song-overlay/index.tsx`                                                                                                       | Integration (orchestrates the hooks above)                      | `index.stories.tsx`           | Null hypothesis holds — value already captured by testing the hooks it composes                       | Story/Chromatic + manual playtest |
| `hangul-hex-cell`, `song-hex-cell`                                                                                                                                                           | Thin wrapper (hover state only)                                 | None                          | Null hypothesis holds                                                                                 | Optional visual-regression story  |
| `control-buttons`, `decorative-particles`, `error-state`, `game-over-modal`, `instructions-panel`, `key-buffer-display`, `loading-state`, `pause-overlay`, `stats-panel`, `success-feedback` | Thin wrapper (pure presentational)                              | Partial via `overlay` stories | Null hypothesis holds                                                                                 | None needed                       |

### Data & types

| File                                         | Category                                                           | Existing tests | Verdict                                                                            | Suggested test                                 |
| -------------------------------------------- | ------------------------------------------------------------------ | -------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------- |
| `data/nfl-roster.ts`                         | Integration (fetch via `maishatu-fetch-kit`) + embedded zod schema | None           | Null hypothesis holds for the network call; schema is a cheap parse-test candidate | Optional schema-only parse test with a fixture |
| `types/hangul-types.ts`, `types/hex-grid.ts` | Types only                                                         | N/A            | Null hypothesis holds — the compiler is the test                                   | None                                           |

## Matrix: workspace dependency `maishatu-fetch-kit` (actually imported by honeycomb)

| File                                                                                               | Category                                                                                                   | Existing tests                                          | Verdict                                                                                              | Suggested test                                                                                                                           |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/fetch-client.ts` (`createFetchClient`, `ApiError`, retry/backoff, content-type branching) | Pure behavior (see Finding 4)                                                                              | None — no test file, no `test` script in `package.json` | **Needs tests; package currently has zero test infra**                                               | Unit, mock global `fetch`; cover retry/backoff timing, timeout→`ApiError`, network-error classification, zod-validation-failure wrapping |
| `src/lib/query-hooks.ts` (`createQueryHook`/`createMutationHook`)                                  | Thin wrapper around TanStack Query + `fetch-client` (own doc comment flags a cache-key/projection footgun) | None                                                    | Null hypothesis mostly holds; the documented cache-key derivation footgun is worth one targeted test | Optional unit test for `queryKey` derivation from `params`                                                                               |

_(`some-ui-shared` is used by honeycomb only for `Card`/`CardHeader`/`CardContent` re-exports in `neuron/index.tsx` — pure presentational passthrough, out of scope beyond that note. `some-ui-utils` is an unused declared dependency — no import sites — excluded entirely.)_

## Matrix: wasm crate `some-hexagon`

| File                                                                                         | Category                                                                           | Existing tests                               | Verdict                                                                                                            | Suggested test                                                                     |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `src/lib.rs` (`CubeCoord`)                                                                   | Pure behavior                                                                      | `#[cfg(test)]` — thorough, ~48 `#[test]` fns | **No further action**                                                                                              | —                                                                                  |
| `src/hex_pattern.rs`, `src/hex_layout.rs`                                                    | Pure behavior                                                                      | Have `#[cfg(test)]` coverage                 | **No further action**                                                                                              | —                                                                                  |
| `src/hex_grid.rs` (`HexGrid`: `generate`, `fill_region`, `fill_ring`, `bounds`, `clear_all`) | Pure behavior                                                                      | None                                         | **Needs tests** (ring/region distance-filter math is exactly the "compiles, silently wrong" case)                  | `cargo test`: `fill_ring` at radius 0 vs >0, `bounds` on empty vs populated grid   |
| `src/hex_cell.rs`                                                                            | Thin wrapper (setters/getters)                                                     | None                                         | Null hypothesis holds                                                                                              | None needed                                                                        |
| `src/utils.rs` (`hex_to_pixel`, `pixel_to_hex` incl. rounding correction)                    | Pure behavior — the rounding-error correction is subtle and easy to break silently | None                                         | **Needs tests**, especially a round-trip check                                                                     | `cargo test`: `pixel_to_hex(hex_to_pixel(coord))` round-trip over a grid of coords |
| `src/wasm_hex.rs` (`WasmHexGrid` wasm-bindgen boundary)                                      | Integration                                                                        | None                                         | Null hypothesis mostly holds for plain `cargo test`; needs `wasm-bindgen-test` (dev-dep already present) if tested | Lower priority than the pure-Rust gaps above                                       |

## Matrix: wasm crate `hangul-game-core`

| File                                                                                | Category                                                                                                                   | Existing tests                                                              | Verdict                                                                                                             | Suggested test                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib.rs` (`HangulGameCore` wasm wrapper)                                        | Thin wrapper (delegates to `GameEngine`)                                                                                   | 3 `#[test]` fns (construction, one spawn, fresh-engine-lifetime regression) | Null hypothesis mostly holds for the wrapper; coverage should target `GameEngine` instead                           | —                                                                                                                                                                                                                                                                                                                |
| `src/internal/engine.rs` (`GameEngine`)                                             | Pure behavior — no wasm deps at all (see Finding 2)                                                                        | **None**                                                                    | **Needs tests, highest priority in the entire recon**                                                               | `cargo test` (no wasm-bindgen-test needed): exact-match vs ambiguous vs invalid branch in `process_input`; expiry penalty + streak reset in `tick`; streak-bonus math and %5-milestone in `handle_match`; speedup/slowdown clamping in `adjust_difficulty_*`; oldest-reveal tie-break in `find_best_match_index` |
| `src/internal/difficulty.rs` (`calculate_spawn_interval`, cubic easing)             | Pure behavior                                                                                                              | None                                                                        | **Needs tests** (pure math, trivial to regress)                                                                     | `cargo test`: boundaries at min/max window, monotonicity                                                                                                                                                                                                                                                         |
| `src/internal/spawning.rs` (`hangul_to_qwerty`)                                     | Pure behavior — mirrors the TS `hangul-keyboard-mapping.ts` table; a mismatch would silently break input matching          | None                                                                        | **Needs tests**                                                                                                     | `cargo test`: table-driven over all jamo + unmapped-char case; consider cross-checking against the TS table in CI                                                                                                                                                                                                |
| `src/internal/game_modes.rs` (`create_game_mode` factory)                           | Pure behavior                                                                                                              | None                                                                        | **Needs tests** (typo'd mode string silently falls back to endless)                                                 | `cargo test`: `"completion"` and unknown-string fallback produce the right type                                                                                                                                                                                                                                  |
| `src/internal/game_modes/completion.rs` (`CompletionMode`)                          | Pure behavior (mastery-gating on `show_romanization`, progress %, reset)                                                   | None                                                                        | **Needs tests** (the "only counts if romanization hidden" gate is exactly the kind of rule a refactor could invert) | `cargo test`: match-while-shown doesn't complete; match-while-hidden does; `is_complete` at 0/partial/full; `reset` clears state                                                                                                                                                                                 |
| `src/internal/game_modes/endless.rs` (`EndlessMode`)                                | Pure behavior, but trivial (constants/no-ops)                                                                              | None                                                                        | Null hypothesis holds — a test would just restate the code                                                          | None needed                                                                                                                                                                                                                                                                                                      |
| `src/internal/types.rs` (`GameConfig::default`, `GameStats::new`)                   | Thin wrapper (data + `Default`)                                                                                            | None                                                                        | Null hypothesis mostly holds; `GameConfig::default()` values are load-bearing elsewhere, worth one regression guard | Optional: assert `GameConfig::default()` field values, same spirit as existing `test_fresh_engine_uses_full_lifetime`                                                                                                                                                                                            |
| `src/internal/events.rs` (`EventBatch::flatten` ordering, serde tag/rename mapping) | Pure behavior — ordering and exact `#[serde(rename = ...)]` wire format both matter to the TS consumer (`GameEventSchema`) | None                                                                        | **Needs tests** (a reordered `flatten()` or dropped `rename` would silently desync from the TS zod schema)          | `cargo test` for ordering; consider a contract test serializing one of each `GameEvent` variant against the TS `GameEventSchema`                                                                                                                                                                                 |

## Summary counts

| Verdict                    | TS/TSX (honeycomb)                                                                                                                                       | Rust (crates)                                                                                        | fetch-kit                  |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------- |
| Needs new tests            | 6 files (`use-game-loop`, `use-game-timer`, `use-hangul-wasm`, `use-hexgrid-wasm`, `keyboard-input-manager`, `wasm-game-bridge` methods) + 2 utils files | 6 files (`engine.rs`, `difficulty.rs`, `spawning.rs`, `game_modes.rs`, `completion.rs`, `events.rs`) | 1 file (`fetch-client.ts`) |
| Null hypothesis holds      | ~14 presentational components + types + data                                                                                                             | `hex_cell.rs`, `endless.rs`                                                                          | —                          |
| Already adequately covered | `use-keyboard-input`                                                                                                                                     | `lib.rs` (both crates), `hex_pattern.rs`, `hex_layout.rs`, `CubeCoord`                               | —                          |
| Partial / optional         | `hex-grid` memo, `hangul-wasm-runtime` race guard, `nfl-roster` schema                                                                                   | `hex_grid.rs`, `utils.rs`, `wasm_hex.rs` (wasm-bindgen-test)                                         | `query-hooks.ts`           |
