# ADR 0002 — Content-domain genericity and the crate-boundary judgment

- **Status:** Accepted
- **Date:** 2026-07-20
- **Epic:** #709
- **Stories:** #714 (B0), #715 (B1), #716 (B2), #717 (B3), #718 (B4)
- **Supersedes:** none
- **Superseded (partially):** §2(d) (the #717 single-cell board-binding call) is superseded by ADR 0003 (`0003-word-challenge-board-and-overlay-architecture.md`) — multi-cell binding, per a concrete UX specification supplied after this ADR was accepted. The rest of this ADR (the `ContentDomain` trait, the API-authority axiom, the crate-boundary judgment) is unaffected.
- **See also:** ADR 0001 (`0001-multimodal-word-testing.md`) — independent, orthogonal axis of generalization; see §1 below. ADR 0003 — supersedes §2(d) only, see above. ADR 0004 (`0004-mutation-isolation.md`, epic #748) — a second, independent constraint on this same pure core: this ADR's Axiom 11.1 governs crate/wasm-boundary _shape_, ADR 0004's Axiom 12.1 governs mutation discipline _inside_ it.

---

## 1. Context

ADR 0001 (epic #420) generalizes `hangul-game-core` along two axes: _how_ a challenge is
perceived (`Stimulus`, #421) and _how long_ an answer is (`Answer` sequences, #422–#423). Neither
of those stories touches _which alphabet_ the answers are drawn from. `hangul_to_qwerty`
(`src/internal/spawning.rs`, now removed) and `create_game_mode`'s 40-entry Korean jamo list
(`src/internal/game_modes.rs`) were closed, content-specific functions: their signatures admitted
no second domain without a change to their own source, independent of anything ADR 0001 changes.
The progression canon (`docs/canon/hangul-progression-canon.typ`, §11) calls this
a _fifth closed commitment_, orthogonal to the four ADR 0001 already addresses (canon §2.1) —
"today Korean, tomorrow perhaps HSK Chinese, who knows" is a real constraint on the crate's shape,
not a hypothetical.

Generalizing a crate's content domain also raises a question ADR 0001 never had to ask: where
should that generalized logic physically live? `crates/leetype_wasm` is a second, independently
authored WASM game crate in this repository — a typed-source-vs-target game rather than
Hangul-vs-QWERTY — that already follows, unprompted, the same private-core/thin-wrapper discipline
this crate does, and shares just enough algorithmic surface ("does typed input still match a
target?") to make "should these share a crate" a fair question. This ADR settles both questions:
the content-domain abstraction itself, and the crate-boundary judgment against `leetype_wasm`.

## 2. Decision

### (a) A `ContentDomain` trait — canon Def. 11.1, Thm. 11.1

`src/internal/content_domain.rs` defines:

```rust
pub trait ContentDomain {
    fn key_for(token: &str) -> String;       // κ_D
    fn completion_alphabet() -> Vec<String>; // A_D
}
```

`Korean` (`src/internal/content_domain/korean.rs`) is the sole production-wired implementation,
carrying exactly the match arms and 40-entry alphabet that used to be free functions/literals.
`GameEngine`, `create_game_mode`, and `EndlessMode` are now generic over `D: ContentDomain` (or take
an injected alphabet) only as far as needed to compile against `Korean` — no other type changes
shape. Canon Theorem 11.1 shows this is sufficient: every type and theorem in canon §3–§8
(`Stimulus`, `Answer`, `Challenge`, the token-cursor matcher, `GameMode`, the difficulty model)
already quantifies over "whatever key-token sequence a challenge carries" and never inspects which
domain produced it, so parametrizing over `D` requires touching only the two content-source
functions.

**Non-decision: the crate keeps its name.** `hangul-game-core` is not renamed as part of this ADR
(canon Rem. 11.1). A rename touches `Cargo.toml`, `package.json`, every import in
`packages/ui/honeycomb`, and `apps/www`'s bundling, for a benefit that is purely nominal until a
second, real content domain is actually wired into production. The story #718 lands (a synthetic,
test-only second domain) deliberately does not count as that trigger — see (c) below.

### (b) The API-authority axiom — canon Axiom 11.1

In any crate governed by this canon, all business logic — state, matching, scoring, difficulty — is
pure Rust, `pub(crate)` or private beyond its own module, and exactly one thin
`#[wasm_bindgen]`-annotated type per crate is permitted to depend on `wasm_bindgen` at all
(`HangulGameCore` here, `TypingGame` in `leetype_wasm`). This is not a new constraint invented for
this ADR: both crates converged on it independently (canon Prop. 11.2), which is stronger evidence
for the discipline than either instance alone. `scripts/check-wasm-bindgen-boundary.sh` enforces it
in CI for both crates.

### (c) The crate-boundary judgment — canon Prop. 11.3–11.4

Pure game logic stays private within each wasm crate (`hangul-game-core`'s `src/internal/`,
`leetype_wasm`'s `src/{game_core,leetype}.rs`) rather than being extracted into a shared library
crate at this time. `leetype_wasm`'s single-target validator (with first-class backspace) and
`hangul-game-core`'s multi-target token-cursor matcher (with an exact/prefix/ambiguous trichotomy
that only exists because several targets can be live and share a prefix) answer the same _problem
statement_ — "does typed input still match a target?" — but are not instances of one _algorithm_
(canon Prop. 11.3). Forcing an extraction now would buy either a hollow single-target abstraction
`hangul-game-core` still has to wrap, or a two-data-point generalization with no third instance to
check it against (Cor. 11.3.1). No new shared crate is introduced by this epic.

This judgment is falsified — not merely reconsidered — the moment either (i) a third
content-typing crate's matching needs coincide, at the algorithm level, with one already
implemented here, or (ii) `hangul-game-core` and `leetype_wasm`'s matchers are found needing the
same change made twice (canon Rem. 11.3).

### (d) Board cell-binding for word-shaped challenges (#717 addendum) — SUPERSEDED by ADR 0003

> **This subsection's decision (single-cell binding) is superseded by ADR 0003
> (`0003-word-challenge-board-and-overlay-architecture.md`), which records multi-cell binding
> instead.** The reasoning below is kept as the historical record of what was decided here and
> why — see ADR 0003 §2(a) for the concrete UX specification that triggered the reversal this
> subsection's own last sentence anticipated ("if a concrete UX reason to prefer it surfaces
> later, that is a new, properly-scoped story").

ADR 0001's #425 (stimulus-aware hex cells) and #705's own narrative ("one or more cells in the
honeycomb become highlighted or obscured") are compatible with two materially different board
bindings for a word-shaped challenge (canon Rem. 5.1):

1. **Single-cell binding.** One challenge occupies exactly one cell (today's model, unchanged): the
   cell shows the stimulus, the player types the full answer against that one cell.
2. **Multi-cell binding.** A challenge occupies `|w|` (or a syllable-block count) of cells
   simultaneously, each obscured until its token is typed — a materially larger change, since
   `completed_cells`' reservation logic and `SpawnResult`'s single `cell_id` field both assume one
   challenge reserves exactly one cell.

**Decision: single-cell binding.** It is the strictly smaller change and satisfies every requirement
of #705's narrative (a highlighted cell, a "?" state, a concept overlay driving the prompt) without
touching cell-reservation arithmetic at all (canon Rem. 5.1). `completed_cells`' and
`SpawnResult.cell_id`'s single-cell-per-challenge assumption is therefore recorded here as
**intentional**, not merely unexamined — #425 may build against it as a settled contract. Multi-cell
binding is not ruled out by anything proved in the canon; if a concrete UX reason to prefer it
surfaces later, that is a new, properly-scoped story, not a silent expansion of #425 or #717.

Board sizing (`HANGUL_GRID_RADIUS = 4`, `wasm-game-bridge/index.ts`) is unaffected: single-cell
binding leaves simultaneously-active cell count coupled to the difficulty model, not to vocabulary
pool size (canon Prop. 5.1). A curriculum stage with a much larger content pool than today's 40
jamo does not force board resizing under this decision.

## 3. Alternatives considered

- **Rename the crate now, anticipating a second domain.** Rejected (canon Rem. 11.1): a rename's
  cost is real and immediate (every downstream import); its benefit is purely nominal until a
  second domain is a concrete, production-wired implementation of `ContentDomain`. The synthetic
  fixture landed in #718 is explicitly test-only and does not count as that trigger.
- **Generalize `Token`/`Key` beyond `String`.** Rejected: every consumer downstream of `GameMode`
  (canon §6) already treats tokens opaquely as `String`; introducing an associated type here would
  touch call sites Theorem 11.1 shows do not need to change, in exchange for type safety no current
  domain (Korean, or #718's synthetic digit fixture) requires.
- **Extract a shared crate with `leetype_wasm` now.** Rejected (canon Prop. 11.3–11.4, Cor. 11.3.1):
  the two matchers share a problem statement, not a reusable algorithm, and extracting from exactly
  two data points risks the "wrong abstraction" the extensions canon's own objective warns against.
  See (c) above for the falsifiable trigger to revisit this.
- **Multi-cell board binding for word-shaped challenges.** Rejected for now (canon Rem. 5.1):
  strictly larger change, not required by #705's narrative, and no concrete UX requirement forces it
  yet. See (d) above.

## 4. Consequences

**Positive**

- `hangul-game-core` can represent and play a content domain that is not Korean jamo (proven, not
  merely asserted, by #718's second `ContentDomain` implementation) without any change to
  `Stimulus`, `Answer`, `Challenge`, the matcher, `GameMode`'s trait shape, or the difficulty model.
- Korean jamo play is unchanged in behavior, regression-covered by tests added alongside the
  extraction (#715) and the per-token difficulty normalization (#716).
- `#425` has a settled single-cell contract to build against instead of discovering the binding
  question mid-implementation.
- No new workspace member, versioning surface, or place Axiom 11.1 must be independently upheld.

**Negative / risks**

- The crate's real second domain (whenever content, not just a synthetic fixture, requires one) will
  need its own asset/curriculum pipeline; this ADR settles the engine-level abstraction only, not
  content provenance (cf. ADR 0001 §5 for that discipline once it applies here).
- If a concrete UX reason later favors multi-cell binding, `completed_cells` and `SpawnResult`'s
  single-`cell_id` assumption becomes a real migration, not just documentation to update.

## 5. References

- Canon: `docs/canon/hangul-progression-canon.typ`, §11 (Content-Domain
  Genericity and the Crate-Boundary Question), §5.1 (board cell-binding, Rem. 5.1, Prop. 5.1), §7
  (Difficulty and Timing Invariance, Thm. 7.2, Cor. 7.2.1)
- ADR 0001, `crates/hangul-game-core/docs/adr/0001-multimodal-word-testing.md`, and epic #420
- Engine: `crates/hangul-game-core/src/internal/{content_domain,engine,game_modes,types}.rs`,
  `src/lib.rs`
- Comparison crate: `crates/leetype_wasm/src/{lib,game_core,leetype}.rs`
- Epic: #709 (#714–#718)
