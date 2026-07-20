# ADR 0001 — Multimodal word testing: a Stimulus/Answer domain model for the Hangul game

- **Status:** Proposed
- **Date:** 2026-07-04
- **Epic:** #420
- **Stories:** #421 (S1), #422 (S2), #423 (S3), #424 (S4), #425 (S5), #426 (S6)
- **Supersedes:** none
- **See also:** ADR 0002 (`0002-content-domain-genericity-and-crate-boundary.md`, epic #709) generalizes a second, independent axis — _which alphabet_ an answer is drawn from — and records the single-cell board-binding decision this ADR's own #425 needs before it can begin.

---

## 1. Context

The Hangul honeycomb game spans two workspaces:

- **`crates/hangul-game-core`** — a pure-Rust game engine compiled to WASM. It owns
  spawning, the input buffer + ambiguity resolution, difficulty, scoring, and the
  `GameMode` strategies (`endless`, `completion`).
- **`packages/ui/honeycomb`** (`@some-ui/honeycomb`) — the React/SVG surface that
  renders the hex grid, drives the spawn/expire loops, and forwards keystrokes to
  the engine.

Today the game tests exactly one relation: **see a single Hangul jamo → type its
romaja/QWERTY key.** That single assumption is baked into every layer:

- `ActiveReveal` (`src/internal/types.rs`) is `{ hangul, expected_key,
revealed_at_ms, cell_id }`. The _prompt_ is implicitly the `hangul` glyph
  rendered as text; the _answer_ is a single short `expected_key` QWERTY token
  derived by `spawning::hangul_to_qwerty`.
- `GameMode::get_next_character()` (`src/internal/game_modes.rs`) yields a single
  jamo `String`. `CompletionMode` tracks an `incomplete_characters: Vec<String>`
  pool of jamo.
- `process_input` (`src/internal/engine.rs`) accumulates a `key_buffer` and matches
  the whole buffer against each reveal's `expected_key` with exact / prefix /
  ambiguous resolution, gated by a `buffer_timeout_ms` staleness window.
- On the UI side, `HangulHexCell`
  (`src/components/hangul-hex-grid/hangul-hex-cell/index.tsx`) draws the glyph, a
  QWERTY hint, and a countdown ring; `useKeyboardInput` +
  `KeyBufferDisplay` assume a short single-token buffer.

### The ask

Extend the game to test a **word** cued by a non-text **stimulus** — an **image**,
an **icon**, or **speech** (TTS/audio) — e.g. _show an apple → type `사과`_, or
_play "사과" → type `사과`_. Two independent generalizations are required, and the
current data model admits neither:

1. The **prompt** is no longer necessarily the answer glyph rendered as text.
2. The **answer** is no longer a single QWERTY token — a word is an _ordered
   sequence_ of jamo, each mapping to 1–3 QWERTY keys.

### Constraints that shape the design

- **The engine is browser-free by construction** (`engine.rs` header comment: "The
  pure Rust game engine — no WASM dependencies"). It must not gain a dependency on
  image decoding, audio, or the DOM.
- **Serde ⇄ zod parity.** Every engine payload that crosses the WASM boundary is
  re-validated by a zod schema in `wasm-game-bridge.ts`. Any new field must be
  added on both sides with matching camelCase names.
- **Single-jamo play must keep working.** The existing `endless` / `completion`
  modes and their behavior (including the just-shipped persist-on-completion of a
  mastered glyph) must survive unchanged.
- **Provenance discipline.** Bundled images/icons/audio must carry license +
  attribution, consistent with the repo's existing stance (cf. #357, #324).

---

## 2. Decision

Introduce two engine-level abstractions and thread them through both workspaces.
Each lettered decision maps to one story under epic #420.

### (a) A `Stimulus` type — _what the player perceives_ — #421

Replace the implicit "prompt == glyph text" with an explicit enum:

```
Glyph(String)                                   // today's behavior
Image(AssetId)
Icon(IconName)
Speech { audio_ref: Option<AssetId>, tts_text: Option<String> }
```

**The engine references stimuli by id/ref only.** It never holds pixels or audio
samples; the honeycomb layer owns the asset table and resolves ids to renderable
sources / TTS calls. This is the load-bearing rule that keeps the engine
browser-free. A `Glyph` stimulus preserves exactly today's behavior, so the change
is additive.

### (b) An `Answer` sequence + syllable-aware matching — #422

Generalize the single `expected_key` into an ordered **answer sequence** (a word),
matched **incrementally**: each active challenge carries a cursor that advances as
correct keys arrive, emitting answer-progress events (current index, remaining,
composed-so-far) and a completion event at the end. The existing exact / prefix /
ambiguous resolution becomes the **one-element special case** of sequence matching —
we generalize the matcher rather than fork a parallel path.

**Open decision deferred to #422 (record the outcome here when it lands):** whether
to test the _raw jamo/QWERTY stream_ (option A) or run a _light composition layer_
that folds jamo into syllable blocks and matches on syllables (option B). This is
decided **once, in the engine**, so no UI component reinvents composition. The
per-keystroke `buffer_timeout_ms` staleness model is also reconciled here into a
per-answer window.

### (c) A `VocabularyMode` game mode — #423

Add a mode that spawns **challenges** (stimulus + answer) from a curated word list,
with completion semantics analogous to `CompletionMode` (drain each word from the
test pool once mastered) plus an endless variant. This requires generalizing the
`GameMode` contract from `get_next_character() -> Option<String>` to a
challenge-returning method; `endless` / `completion` are updated in lockstep so a
jamo is just a one-syllable, glyph-stimulus challenge.

### (d) Content model + asset/TTS pipeline — #424

Define a `WordEntry` schema (zod, next to the `wasm-game-bridge.ts` schemas):
`{ word, romanization, answerSequence, imageAssetId?, iconName?, audio?: { ref?;
ttsText? } }`, a small seed dataset following the `src/data/` convention (cf.
`nfl-roster.ts`), and an asset-id → renderable-source map that lives entirely in
honeycomb. Policy: **TTS-first** for speech (Web Speech API), an **openly-licensed
icon set** for icons, and images only where licensing is clean — every bundled
asset carries attribution.

### (e) Stimulus-aware hex cells — #425

Teach `HangulHexCell` to render the `Stimulus` kind: image cell
(`<image>`/`foreignObject`), icon cell, and a speech cell with a play/replay
control — while keeping the countdown ring, urgency, and solved/persisted states
working for every kind. The SVG geometry in `overlay/index.tsx` stays the single
source of layout. Storybook stories cover each variant.

### (f) Word-answer input, progress, and speech playback — #426

Consume the answer-progress/completion events in `useKeyboardInput`, show
composed-so-far vs remaining (extending `KeyBufferDisplay` or a new word-progress
panel), and wire speech playback through the existing `useGameAudio` unlock path
with replay + a caption/romanization fallback for accessibility.

### Sequencing

`#421 → #422 → #423` form the engine spine and land first. `#424` (content) can
proceed in parallel. `#425` needs `#421 + #424`; `#426` needs `#422 + #425`.
Modalities can ship incrementally: **glyph-word first**, then image/icon, then
speech.

---

## 3. Alternatives considered

- **Carry assets through the engine (data URIs in `SpawnResult`).** Rejected: it
  makes the engine hold binary payloads, bloats the WASM boundary, and breaks the
  browser-free invariant. Ids/refs keep the engine pure and let the UI cache/lazy-load.
- **A second, parallel "word engine" beside the jamo engine.** Rejected: duplicates
  spawning, difficulty, scoring, and the ambiguity resolver, and doubles the
  maintenance + test surface. A jamo is provably a one-syllable word, so a unified
  matcher is strictly more general.
- **Compose syllables in the UI (per component).** Rejected: composition is a
  correctness concern that determines what counts as a match; scattering it across
  cells/hooks guarantees drift. It belongs in the engine (decided in #422).
- **Images-only prompts (skip TTS/icons).** Rejected on cost/licensing: curated
  imagery is the hardest asset class to license cleanly; TTS + an open icon set
  deliver the multimodal goal with far less provenance risk.

---

## 4. Consequences

**Positive**

- One engine, one matcher: jamo and word play share spawning, difficulty, scoring,
  and ambiguity resolution. Single-jamo behavior is the degenerate case and is
  covered by a regression test (#421).
- The browser-free engine invariant is preserved; assets and audio stay in the layer
  that already owns the DOM.
- Modalities are incrementally shippable and independently testable.

**Negative / risks**

- The `GameMode` trait signature change (#423) touches both existing modes — they
  must be migrated in lockstep or the change kept back-compatible.
- Serde ⇄ zod parity now covers richer payloads; a mismatch surfaces as a runtime
  zod parse error in `wasm-game-bridge.ts`. New fields need tests on both sides.
- Speech depends on browser TTS availability and the existing audio-unlock gate; a
  text/romanization fallback is mandatory (#426), not optional.
- Asset provenance is an ongoing obligation, not a one-time task (#424).

---

## 5. License & attribution

Any bundled icon set, imagery, or prerecorded audio must ship with its source,
license, and attribution recorded alongside the asset map (#424), consistent with
the repo's provenance discipline (cf. #357 encyclopedia provenance, #324 license
headers). TTS output generated at runtime by the Web Speech API carries no bundling
obligation.

---

## 6. References

- Engine: `crates/hangul-game-core/src/internal/{engine,types,events,spawning,game_modes}.rs`, `src/lib.rs`
- UI: `packages/ui/honeycomb/src/{components/hangul-hex-grid,hooks,lib/hangul,utils,data}`
- ADR format precedent: `extensions/some-filter/docs/adr/0001-dark-mode-pipeline-rework.md`
- Provenance/licensing precedent: #357, #324
