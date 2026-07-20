# ADR 0003 — Word-challenge board binding, backspace, and the prompt/feedback overlay system

- **Status:** Accepted
- **Date:** 2026-07-20
- **Epic:** #420
- **Stories:** #421 (S1), #422 (S2), #423 (S3), #424 (S4), #425 (S5, re-scoped), #426 (S6,
  re-scoped), #762 (S7, new)
- **Supersedes:** ADR 0002 §2(d) / #717 (single-cell board binding)
- **See also:** ADR 0001 (`0001-multimodal-word-testing.md`, epic #420) — the Stimulus/Answer
  domain model this ADR builds on. ADR 0002
  (`0002-content-domain-genericity-and-crate-boundary.md`, epic #709) — the `ContentDomain`
  trait and per-token difficulty budget this ADR reuses unchanged.

---

## 1. Context

`crates/hangul-game-core/docs/hangul-progression-canon.typ` ("The Single-Glyph Ceiling") and ADR
0001 already derive most of what a word-mode extension needs: a `Stimulus` type (canon §3), an
`Answer` sequence with token-cursor matching (canon §4), a generalized `Challenge`/`GameMode`
(canon §5–§6), and `AnswerProgress`/widened completion events (canon §8). That derivation is
correct and unchanged by this ADR.

Three things were left open, and one turned out to be answered incorrectly with the information
available at the time:

1. **Board binding.** Canon Remark 5.1 names single-cell vs. multi-cell binding as an explicit
   open choice and recommends single-cell only in the _absence_ of "a concrete UX reason to prefer
   multi-cell." ADR 0002 §2(d) / story #717 recorded single-cell as the decision on exactly that
   basis. A concrete specification has since been supplied (word scattered across multiple hex
   cells as placeholder icons, each revealed in typed order) — precisely the trigger canon Remark
   5.1 anticipated for revisiting the call.
2. **Backspace.** Canon §11.3 (comparing `hangul-game-core` against `leetype_wasm`) uses "no
   backspace concept" as one of the structural differences justifying the crate-boundary judgment.
   No story had actually decided whether backspace was in scope for word mode; it now is,
   deliberately bounded in scope (see §2(b) below).
3. **The overlay system.** ADR 0001 §2(e)/(f) (stories #425/#426) assumed stimulus rendering
   (image/icon/speech) lives on the hex cells themselves. A concrete wireframe supplied since then
   shows the actual design intent is different: hex cells stay minimal (a placeholder + reveal
   state), and the stimulus/hint delivery lives in a separate, persistent, corner-anchored overlay
   with its own escalation behavior.

This ADR settles all three, and reconciles an informal `WordChallenge` state-machine sketch
(supplied alongside the wireframe) against the canon's already-proven `ActiveChallenge`
generalization, so the two are recorded as one design, not two competing ones.

## 2. Decision

### (a) Board binding: multi-cell

An active word challenge reserves `|w|` cells simultaneously at spawn — `cell_ids` (canon Def.
4.2) becomes an **ordered** sequence, not a single scalar, with position `i` bound to answer token
`w_i`. All `|w|` cells render immediately as a placeholder icon (not the jamo glyph); as the
token-cursor (Def. 4.3) advances past token `i` on a correct match, cell `i` flips from placeholder
to its revealed jamo. This directly supersedes ADR 0002 §2(d)'s single-cell call.

**Timer model: one shared countdown for the whole word**, not independent per-cell deadlines. This
requires no new engine work: it is exactly #716's existing per-token budget formula
(`revealed_at_ms + token_count * current_lifetime_ms`), which already scales a single challenge's
total expiry linearly with its token count. Every cell belonging to the word displays the same
challenge-level countdown. Independent per-cell deadlines were considered and rejected: a
not-yet-reached jamo's cell expiring before the player gets to it (because they're still working
through earlier jamo) has no clean resolution — does the rest of the word survive a mid-sequence
timeout? — and adds a second timer dimension #716 was not designed for.

`completed_cells`' reservation logic and `SpawnResult`'s cell representation both need to widen
from a single `cell_id: String` to an ordered collection; this is the concrete follow-up work for
#421/#423 that #717 flagged as "a larger story... re-scoped before implementation begins."

### (b) Backspace: current-token-only

A backspace input clears the last entry of the current token's shared key buffer — the same
timeout-gated buffer `process_input` already maintains (canon Def. 4.3) — rather than any
persistent per-challenge typed history. Concretely: if the player has typed `h` toward a
two-key token like `hk` (ㅘ) and meant something else, backspace clears that `h` before it
times out or resolves to a miss. Backspace **cannot** un-advance the cursor past an
already-matched token, cannot reopen an already-revealed cell, and never touches score, streak, or
mastery state for tokens already matched.

This was the smaller of two considered scopes (see §3) and needs no new persistent state: the
existing `key_buffer: Vec<KeyBufferEntry>` (`src/internal/engine.rs`) is already exactly what
backspace pops from. `leetype_wasm`'s backspace model (a persistent, positionally-diffed
typed-buffer against one fixed target — `crates/leetype_wasm/src/leetype/{validation,state}.rs`)
is **not reusable as-is**: it is shaped for one linear buffer against one target, whereas
`hangul-game-core`'s buffer is transient-per-token and shared across N simultaneously active
challenges. The bounded scope chosen here needs none of leetype's machinery — the _principle_
("recompute error/buffer state from a shrunk length, never block backspace") transfers, but not
the code.

**Correction to canon §11.3.** The crate-boundary judgment (ADR 0002, Prop. 11.3–11.4) cited "no
backspace concept" in `hangul-game-core`'s matcher as one structural difference from
`leetype_wasm`. That is no longer accurate as a description of the target design. It does not
change the judgment itself: even with current-token-only backspace, `hangul-game-core`'s matcher
remains a multi-target, no-persistent-undo-history design fundamentally unlike `leetype_wasm`'s
single-target, full-history-diff model (§2(b) above). No new shared crate is warranted by this
correction; it is recorded here so the canon's grounding table is not left silently stale.

### (c) Reconciling `WordChallenge` with the canon's `ActiveChallenge`

The supplied state-machine sketch —

```
Waiting → Spawn → InProgress → StrokeMatched → AdvanceCursor → ... → WordComplete → Celebrate → Waiting
```

— describes the same object as canon Definition 4.2's generalized `ActiveChallenge`
(`stimulus, w, c, revealed_at_ms, cell_ids`) at `|w| > 1`, with `StrokeMatched`/`AdvanceCursor`
naming the same transition Definition 4.3 already specifies (cursor `c := c + 1` on an exact
token match). **Decision: keep the canon's single generalized struct, not a separate
`Challenge` enum** (`SingleJamo | Word | Phrase`) as the sketch alternatively proposes. Theorem
4.1 already proves the generalized matcher is observationally identical to today's single-jamo
matcher at `n = 1` — introducing a parallel enum would rebuild a less-proven abstraction next to
one already shown correct, for no behavioral gain. `Celebrate` is adopted as the name for the new
terminal phase after challenge completion — the reveal ceremony (§2(d) below) — which the canon's
event algebra (§8) did not previously name as a distinct phase but is fully consistent with
(`MatchFound`'s widened payload, canon Prop. 8.1, already carries what a completed word's ceremony
needs to render).

### (d) The two-overlay system

Both are host-layer (`packages/ui/honeycomb`) realizations of engine primitives the canon already
specifies — **no new engine type is introduced by this decision**, consistent with the
asset-opacity axiom (canon Axiom 3.1): the engine emits ids/refs and progress data; the UI resolves
and renders them.

- **Prompt/Concept Station** (new component, `#762`). A persistent, corner-anchored overlay
  rendering the active challenge's `Stimulus`: idle "radio" state (audio-first, minimal footprint)
  that expands to a "TV" state on player struggle, with progressively richer hint tiers (emoji →
  SVG → static image → short looping video → example-sentence carousel). **Hint-tier escalation is
  computed client-side from existing events** — miss count and elapsed time on the currently active
  challenge, both already observable from `InputMissed`/`CharactersExpired`/spawn timestamps — not
  a new engine-owned concept. This keeps the engine free of UI/hint policy, per Axiom 3.1.
  This narrows the stimulus-rendering half of ADR 0001 §2(e)/#425's original scope: image/icon/
  speech stimuli render here, not on individual hex cells.
- **Feedback/confirmation overlay** (`#426`). A masked-word display — blanks that reveal
  per-jamo as `AnswerProgress` events (canon Def. 8.1: `cell_ids, composed_so_far, remaining,
cursor, total`) arrive — plus the `Celebrate` ceremony (checkmark, full word reveal) on
  completion. Structurally analogous to the existing `KeyBufferDisplay` card
  (`packages/ui/honeycomb/src/components/hangul-hex-grid/key-buffer-display/index.tsx`): a
  centered, `pointer-events-none`, glass-effect card, just driven by word-level progress instead of
  raw keystroke buffer contents.
- **Hex-grid impact stays minimal.** `HangulHexCell` gains one additive placeholder/masked variant
  and on-cell reveal visuals (`#425`, re-scoped down from its original stimulus-cell scope); the
  underlying `HexGrid` generic-content system, hex geometry, and coordinate math are untouched —
  this is not a hex-grid rearchitecture.

Between-challenge narration (spoken transition phrases between words, from the wireframe) is noted
as optional/future content-layer work under `#424`, not core scope for `#762`.

## 3. Alternatives considered

- **Full-word backspace revisit** (re-open and re-type any already-completed jamo in the word).
  Rejected for now: requires a new persistent typed-history per active challenge, a decision on
  what happens to score/streak/mastery already awarded for a jamo being un-revealed, and a
  redesign of the "cell locks in on match" semantics `completed_cells` already relies on elsewhere
  in the engine. Current-token-only backspace satisfies the stated need (correct a fat-fingered
  keystroke before it locks in) at a strictly smaller cost. Revisit if a concrete case for
  full-word revisit surfaces later — same falsifiability discipline as canon Remark 11.3.
- **Independent per-cell countdown deadlines.** Rejected: see §2(a). Adds a second timer
  granularity #716 does not model and an unresolved "what happens to the rest of the word" question
  with no clean answer.
- **A separate `Challenge` enum (`SingleJamo | Word | Phrase`).** Rejected: see §2(c). The canon's
  single generalized struct is already proven equivalent at `n = 1`; an enum would be strictly less
  general, duplicating Theorem 4.1's work for no benefit.
- **Stimulus rendering on hex cells, per ADR 0001's original #425 framing.** Superseded by the
  wireframe's overlay-first design (§2(d)). Hex cells stay content-minimal; the corner-anchored
  station owns concept/hint delivery.

## 4. Consequences

**Positive**

- All three previously-open decisions (board binding, backspace, overlay architecture) are now
  settled and traceable to a concrete rationale, unblocking #421–#426 and #762.
- No engine work from #709 (`ContentDomain`, per-token difficulty budget) needs to change or be
  reverted; the shared-word-countdown decision directly reuses #716's formula unmodified.
- The hex grid and its underlying generic content system (`some-hexagon`, `HexGrid`) require no
  rearchitecture — confirmed still correctly factored out, per canon P.1.

**Negative / risks**

- `SpawnResult`/`ActiveReveal`/`completed_cells`' single-`cell_id` assumption must now actually
  widen to an ordered collection (§2(a)) — real engine work for #421/#423, not just documentation,
  unlike #717's single-cell call which needed none.
- The Prompt/Concept Station (#762) is a genuinely new, motion-heavy UI subsystem with no existing
  analog in `packages/ui/honeycomb` to build on directly (confirmed via codebase search — no
  existing "music card"/"Concept Overlay" component); it is scoped as its own story rather than
  folded into #426 specifically because of this size and novelty.
- Canon §11.3's grounding table should be corrected in a future canon revision to note backspace's
  now-accurate scope, per the Amendment Protocol (canon §11, "Sequencing against ADR 0001").

## 5. References

- Canon: `crates/hangul-game-core/docs/hangul-progression-canon.typ`, §3 (Stimulus, Axiom 3.1),
  §4 (Answer sequence, token-cursor matcher, Def. 4.1–4.3, Thm. 4.1), §5.1 (Rem. 5.1, board
  binding), §6 (generalized `GameMode`), §7 (difficulty/timing invariance, Thm. 7.2), §8
  (event algebra, Def. 8.1, Prop. 8.1), §11.3 (crate-boundary judgment, Prop. 11.3–11.4)
- ADR 0001, `0001-multimodal-word-testing.md`, epic #420 (#421–#426)
- ADR 0002, `0002-content-domain-genericity-and-crate-boundary.md`, epic #709 (superseded §2(d))
- Engine: `crates/hangul-game-core/src/internal/{engine,types,events,game_modes,content_domain}.rs`
- UI: `packages/ui/honeycomb/src/{components/hangul-hex-grid,hooks,lib/hangul}`
- Comparison crate: `crates/leetype_wasm/src/leetype/{validation,state}.rs` (backspace, not reused
  as-is — see §2(b))
- Issue #717 (superseded), epic #420's #421–#426 and #762
