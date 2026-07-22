# ADR 0004 — Mutation isolation: a purity boundary inside the pure core

- **Status:** Accepted
- **Date:** 2026-07-22
- **Epic:** #748
- **Stories:** #749 (M0), #750 (M1), #751 (M2), #752 (M3), #753 (M4)
- **Supersedes:** none
- **See also:** ADR 0002 (`0002-content-domain-genericity-and-crate-boundary.md`, epic #709) — the
  API-authority axiom (§2(b)) this ADR is orthogonal to, not a restatement of; see §1 below.

---

## 1. Context

ADR 0002 §2(b) (canon Axiom 11.1) already requires that all business logic in a wasm-bindgen crate
be pure Rust, private beyond its own module, behind exactly one thin `#[wasm_bindgen]` wrapper. That
axiom governs the crate/wasm-boundary _shape_ — one wrapper, pure core behind it — and says nothing
about mutation discipline _inside_ that pure core. An audit run against #748 confirms the gap is
real, not already adjudicated by ADR 0002 or ADR 0001: neither document mentions function-level
mutability, and the audit found `&mut self`/`&mut T` is the crate's default signature shape, not an
isolated exception reserved for genuine state transitions.

Two concrete pieces of evidence forced this ADR rather than a general tidiness preference:

- `GameEngine::process_input` (`internal/engine.rs`) builds a local `let mut batch =
EventBatch::new()` and threads `&mut batch` — a second, independently mutable reference alongside
  the `&mut self` call chain — through `advance_or_complete`, into `handle_match`/`handle_miss`, into
  `adjust_difficulty_faster`/`adjust_difficulty_slower`. A single keypress fans out four levels of
  `&mut self` and three levels of `&mut EventBatch`.
- `GameMode`'s trait contract (`internal/game_modes.rs`) requires `&mut self` on `get_next_challenge`
  and `on_miss`, but no implementation (`CompletionMode`, `EndlessMode`, `VocabularyMode`) mutates
  `self` in either method. `EndlessMode` is a zero-field unit struct — every one of its `&mut self`
  methods is structurally a no-op, which is itself proof the trait over-requires mutation for a
  degenerate implementation.

The crate already has exemplars that satisfy the constraint this ADR names, without having been
written against it explicitly: `internal/difficulty.rs` is fully pure (zero `&mut` in the file), and
`internal/events.rs::flatten` builds a local, owned `Vec<GameEvent>`, mutates only what it locally
owns, and returns it.

## 2. Decision

### (a) The mutation-isolation axiom — canon Axiom 12.1

A function or method takes `T`/`&T` by default. `mut T`/`&mut T` is permitted only where a genuine
state transition occurs, confined to the smallest possible scope: the mutation happens at one
explicit transition point per operation, and a `&mut` reference is never re-threaded across more
than one private-helper call boundary. `GameEngine`'s genuinely stateful top-level methods
(`process_input`, `tick`, `spawn_character`, `start_timer`, `reset`) are the transition points; every
private helper they call computes and returns a value instead of mutating one handed to it.

This is stated in `crates/hangul-game-core/docs/hangul-progression-canon.typ` §12, following the same
axiom/proposition/remark structure §11 uses for Axiom 11.1.

### (b) `GameMode` de-mutification (#750)

`GameMode::get_next_challenge` and `GameMode::on_miss` become `&self` in the trait and in all three
implementations (`CompletionMode`, `EndlessMode`, `VocabularyMode`). `initialize`, `on_match`, and
`reset` stay `&mut self`: `CompletionMode`/`VocabularyMode` genuinely mutate in all three
(`on_match`'s `insert`/`retain`, `reset`'s pool restoration, `initialize`'s call to `reset`).
`EndlessMode`'s own no-op bodies for these three do not force the trait's shape — one implementation's
genuine need is enough to justify the trait requiring `&mut self`, the same reasoning ADR 0002 §2(c)
applies when judging a shared abstraction against its instances.

### (c) No re-threaded `&mut EventBatch` (#751)

`handle_match`, `handle_miss`, `advance_or_complete`, `adjust_difficulty_faster`, and
`adjust_difficulty_slower` stop taking `batch: &mut EventBatch`. Each returns the event(s) it
produces instead — a `PrimaryEvent`, a `Vec<SecondaryEvent>`, an `Option<SecondaryEvent>`, or (for
`advance_or_complete`, which has two outcome shapes) a small private `AdvanceOutcome` enum — and
`process_input`/`tick` become the only two functions in `engine.rs` holding a live, owned
`EventBatch` binding, extending it with what each helper returns. This mirrors
`events.rs::flatten`'s existing pattern rather than inventing a new one.

### (d) Pure match-outcome and difficulty-step calculators (#752)

A pure `compute_match_outcome(stats: &GameStats, config: &GameConfig, revealed_at_ms: u64, now: u64)
-> (GameStats, MatchCalc)` is extracted from `handle_match`'s body, covering everything that is a
function of prior stats and elapsed time alone (quality check, streak/score/best-streak update,
streak-milestone detection). `handle_match` keeps the one mutation `compute_match_outcome` cannot
perform itself — `self.game_mode.on_match(...)`'s stateful mastery check and the resulting
`completed_cells` membership change — as an explicit, isolated step after the pure call, per canon
Remark 12.2 ("this section does not require" the mutation to vanish, only to stop being
re-threaded). Two pure step functions, `compute_speedup`/`compute_slowdown`, move into
`internal/difficulty.rs` alongside its existing `calculate_spawn_interval`, following that file's
established style; `adjust_difficulty_faster`/`adjust_difficulty_slower` reduce to one pure call plus
a terminal assignment to `self.current_lifetime_ms` (and, for the faster path,
`self.streak_tokens`).

### (e) A CI gate, sibling to the wasm-bindgen boundary check (#753)

`scripts/check-mutation-boundary.sh` scans `crates/hangul-game-core/src/internal/**/*.rs` and fails
on any `&mut self`/`&mut T` parameter not on an explicit, named allow-list. The allow-list is seeded
with exactly the top-level `GameEngine` methods named in Axiom 12.1: `process_input`, `tick`,
`spawn_character`, `start_timer`, `reset`. It runs in the same CI step as
`check-wasm-bindgen-boundary.sh`, so both boundary constraints are enforced together going forward.

## 3. Alternatives considered

- **Fold this into ADR 0002 as an addendum instead of a new ADR.** Rejected: ADR 0002 is Accepted and
  closed against epic #709; #748 is a distinct epic with its own audit and its own child stories. The
  repo's own precedent (ADR 0001 → ADR 0002 → ADR 0003, each a new file for a new epic even when
  closely related) is to file a new ADR and cross-link, not to reopen an accepted one.
- **Make every `GameMode` method `&self` for uniformity, forcing `CompletionMode`'s mutations into
  interior mutability (`Cell`/`RefCell`).** Rejected: this would trade one real, honest `&mut self` on
  a trait method for a hidden mutable-borrow-at-runtime inside a type that claims to be shared by
  `&self`, which is a worse violation of Axiom 12.1's spirit than leaving `initialize`/`on_match`/
  `reset` as `&mut self` on the trait.
- **Have `handle_match`/`handle_miss` return a full owned `EventBatch` instead of a
  primary/secondary tuple.** Rejected: it would make `EventBatch` constructible in more than the two
  places (`process_input`, `tick`) this ADR's own acceptance criteria name, reintroducing exactly the
  ambiguity about "who owns the event collection" this story exists to remove.
- **Skip the CI gate and rely on review discipline.** Rejected: Axiom 11.1 already has
  `check-wasm-bindgen-boundary.sh` as enforcement precisely because review discipline alone let the
  mutation-isolation violations this epic fixes accumulate in the first place.

## 4. Consequences

**Positive**

- A single keypress's mutation surface is legible from `process_input`'s own body: one `&mut self`,
  one locally-owned `EventBatch`, no independently-threaded second mutable reference three calls deep.
- `compute_match_outcome`/`compute_speedup`/`compute_slowdown` are directly unit-testable without
  constructing a `GameEngine`, the concrete payoff Axiom 12.1 exists to buy.
- `EndlessMode`'s trait conformance no longer requires performative `&mut self` on methods that were
  always read-only or no-ops.
- The constraint is enforced going forward by `check-mutation-boundary.sh`, not left to accumulate
  again the way the pre-#748 state shows it did.

**Negative / risks**

- `GameMode` implementers must now reason about which methods are genuinely mutating per
  implementation, rather than defaulting every method to `&mut self`; this ADR's §2(b) judgment call
  is the precedent future implementers should follow, not re-litigate per story.
- The CI allow-list (§2(e)) is a maintenance surface: a genuinely new stateful top-level method added
  to `GameEngine` later must be added to the allow-list with the same justification this epic used, or
  CI fails on a legitimate addition.

## 5. References

- Canon: `crates/hangul-game-core/docs/hangul-progression-canon.typ`, §12 (Mutation Isolation and the
  Purity Boundary, Axiom 12.1, Prop. 12.1–12.2, Rem. 12.1–12.2), §11.2 (Axiom 11.1, orthogonal)
- ADR 0002, `crates/hangul-game-core/docs/adr/0002-content-domain-genericity-and-crate-boundary.md`
  (Axiom 11.1's original filing; the format precedent this ADR follows)
- Engine: `crates/hangul-game-core/src/internal/{engine,game_modes,events,difficulty}.rs`,
  `internal/game_modes/{completion,endless,vocabulary}.rs`, `src/lib.rs`
- `scripts/check-wasm-bindgen-boundary.sh` (CI-gate precedent for #753's
  `scripts/check-mutation-boundary.sh`)
- Epic: #748 (#749–#753)
