// ═══════════════════════════════════════════════════════════════════════════
//  CANON I — The Single-Glyph Ceiling
//  A Formal Post-Mortem and Generalization Canon for the Hangul Game Engine
// ═══════════════════════════════════════════════════════════════════════════

#set document(
  title: "The Single-Glyph Ceiling",
  author: "some-ui Hangul Game Working Group",
)
#set page(paper: "a4", margin: 2.5cm, numbering: "1")
#set text(size: 10.5pt, lang: "en")
#set par(justify: true, leading: 0.68em)
#set heading(numbering: "1.1")
#set list(indent: 0.3em)
#set enum(indent: 0.3em)

// ── Local styling primitives ─────────────────────────────────────────────
//
// Numbering of Definitions / Axioms / Propositions / etc. is done BY HAND
// (the string passed as `num`), not via Typst counters, for the same reason
// the extensions canon does this: the numbers are stable citation anchors
// across future amendments (§11), and survive section reshuffles better
// than an automatic counter would.

#let canon(kind, num, body, name: none) = [
  #v(0.55em)
  #block(inset: (left: 0pt))[
    *#kind #num.* #if name != none [_#name._ ] #body
  ]
  #v(0.35em)
]

#let definition(num, body, name: none) = canon("Definition", num, body, name: name)
#let axiom(num, body, name: none) = canon("Axiom", num, body, name: name)
#let proposition(num, body, name: none) = canon("Proposition", num, body, name: name)
#let theorem(num, body, name: none) = canon("Theorem", num, body, name: name)
#let lemma(num, body, name: none) = canon("Lemma", num, body, name: name)
#let corollary(num, body, name: none) = canon("Corollary", num, body, name: name)
#let remark(num, body, name: none) = canon("Remark", num, body, name: name)

#let proof(body) = [
  #v(0.15em)
  #block(inset: (left: 1em))[_Proof._ #body ∎]
  #v(0.35em)
]

#let rule(name, body) = [
  #v(0.4em)
  #block(
    inset: 8pt,
    stroke: 0.4pt,
    width: 100%,
  )[
    #text(size: 9.5pt)[*#name*]
    #v(0.2em)
    #text(size: 9.5pt)[#body]
  ]
  #v(0.4em)
]

// ═══════════════════════════════════════════════════════════════════════════
// FRONT MATTER
// ═══════════════════════════════════════════════════════════════════════════

#align(center)[
  #v(1.5cm)
  #text(size: 22pt, weight: "bold")[The Single-Glyph Ceiling]
  #v(0.4em)
  #text(size: 13pt, style: "italic")[
    A Formal Post-Mortem and Generalization Canon\
    for the Hangul Game Engine
  ]
  #v(1.2em)
  #text(size: 11pt)[Canon I of the Hangul Game Architecture]
  #v(0.15em)
  #text(size: 10pt)[Governing `hangul-game-core` · `@some-ui/honeycomb` · and all descendant curricula]
  #v(1em)
  #text(size: 9.5pt)[Version 1.1 --- 2026-07-19]
  #v(0.3em)
  #text(size: 9pt)[Filed against `paulgsc/some-ui`\#705; formalizes and extends ADR 0001]
  #v(2cm)
]

#block(inset: (left: 1.5em, right: 1.5em))[
  *Abstract.* Issue \#705 names a symptom --- "current wasm is overfit for
  level 1" --- and asks for the post-mortem this canon supplies. The engine
  in question tests exactly one relation, *see one jamo, type one QWERTY
  token*, and that single relation is not an implementation detail confined
  to one function: it is load-bearing in four independent places at once
  (`ActiveReveal`'s scalar fields, `GameMode::get_next_character`'s scalar
  return type, `hangul_to_qwerty`'s closed 40-entry domain, and a difficulty
  model calibrated, unexamined, around one keystroke's worth of decision
  time). This document does not begin by proposing a `WordMode` and working
  out its plumbing. It begins in a *Prolegomenon* that names the pain without
  curing it, characterizes the computational class the fix belongs to, tables
  and rejects four candidate generalizations against that pain, and only then
  derives --- rather than posits --- that the unit of play must become a
  *challenge* (a stimulus paired with an ordered answer sequence), that the
  engine's matcher must be re-derived as a token-cursor generalization of
  which today's single-jamo matching is the exhibited $|w|=1$ case, and that
  difficulty must be re-parametrized per answer-token rather than per
  challenge, on pain of a curriculum whose later stages are, by construction,
  harder at every nominal difficulty setting than its first. Two genuine
  production defects are exhibited along the way, not as color but as load-
  bearing evidence for the diagnosis: `EndlessMode` emits a magic string
  (`"random"`) that no consumer of the engine actually interprets, and the
  Rust and TypeScript "default config" objects have silently diverged on one
  of eleven fields. Both are direct consequences of the same underlying
  fault --- a content contract carried by bare, unchecked primitives across a
  language boundary --- and both are used here as forcing evidence for why
  the generalization below must close over *typed* objects, not wider
  strings. The formal canon is then grounded, definition by definition,
  against the present source of `crates/hangul-game-core` and
  `packages/ui/honeycomb`. A v1.1 addition generalizes the diagnosis one
  step further, ahead of implementation rather than after a second content
  domain forces it: the content pool itself (`Jamo`, `hangul_to_qwerty`,
  the 40-entry completion alphabet) is shown to be a *fifth* closed
  commitment, hidden behind the other four, and is factored behind an
  explicit content-domain abstraction so that a future non-Korean curriculum
  is a new implementation, not a rewrite. That addition also settles, by
  comparison against the structurally analogous `leetype_wasm` crate, a
  standing question about crate topology: whether pure game logic shared
  across content-typing games belongs in its own composable crate or stays
  private to each wasm crate. The canon closes with an Amendment Protocol
  that sequences the fix against ADR 0001's existing story breakdown
  (\#421--\#426) rather than duplicating it.
]

#v(0.6em)
#block(inset: (left: 1.5em, right: 1.5em))[
  *Status of this document.* This is the post-mortem technical spec review
  \#705 asks for, not a substitute for ADR 0001
  (`crates/hangul-game-core/docs/adr/0001-multimodal-word-testing.md`). Where
  the two overlap, ADR 0001's *decision* stands; this canon supplies the
  *derivation* the ADR states as given (why a `Stimulus`/`Answer` split is
  forced rather than merely convenient), and supplies two things the ADR does
  not yet cover at all: a formal proof that single-jamo play is the
  degenerate one-token case of the generalized matcher (so "single-jamo play
  must keep working" in the ADR's constraints is a theorem here, not an
  assertion to be regression-tested for), and a difficulty-invariance
  argument the ADR's story \#423 (`VocabularyMode`) will need before its
  curriculum stages can be tuned coherently against each other. Neither ADR
  0001 nor \#705 asks whether the engine should keep assuming its content
  domain is Korean; §11 states that requirement explicitly and derives what
  it costs.
]

#v(0.6em)
#block(inset: (left: 1.5em, right: 1.5em))[
  *What kind of object this is.* The object under revision here is the
  *content-model algebra* the engine closes over --- the smallest set of types
  and operations from which `EndlessMode`, `CompletionMode`, and every future
  curriculum stage in \#705's progressive user story (letters, then numbers,
  then weekdays and weather, then objects and verbs) can be *derived* rather
  than separately hand-written. The search is explicitly for the *smallest*
  adequate generalization: every additional primitive the sections below
  introduce is admitted only because a specific, exhibited failure of the
  present, narrower model forces it, in the same spirit as the extensions
  canon's minimal-sufficient-state-space objective
  (`docs/canon/dom-state-estimation-canon.typ`).
]

#pagebreak()
#outline(title: "Contents", indent: auto)
#pagebreak()

// ═══════════════════════════════════════════════════════════════════════════
#heading(level: 1, numbering: none)[Prolegomenon --- Why This Object]
// ═══════════════════════════════════════════════════════════════════════════

A generalization earns its notation only after the alternatives have been
tried and shown to fail against the pain that motivated it. This Prolegomenon
climbs that ladder before §1 fixes any notation: pain, then computational
class, then a bake-off of candidate fixes, then the derivation of the
primitive objects, and only then the axioms and theorems of §2 onward.

#heading(level: 2, numbering: none)[P.0 · Phenomenology (the pain, stated without a cure)]

Issue \#705's diagnosis --- "the modules are overfit to only solve the most
fundamental, type 1 level game play" --- decomposes into concrete, exhibited
symptoms, each paired with the tacit assumption it falsifies:

- *The prompt is always renderable as the answer, verbatim.* `ActiveReveal`
  (`src/internal/types.rs`) is `{ hangul: String, expected_key: String,
  revealed_at_ms: u64, cell_id: String }`: the thing shown to the player
  *is* the thing they must type, just pre-rendered. There is no field that
  could hold "an image of an apple" while the answer is `"사과"`.
  --- _Assumes: perception and recall are the same string._
- *The answer is always exactly one token.* `expected_key: String` is
  matched by `process_input` as a single opaque string against the
  player's buffer, with no internal structure. A word is not one token; it
  is an *ordered sequence* of them, and nothing downstream --- matcher,
  events, UI --- has a notion of a sequence with a cursor.
  --- _Assumes: an answer has no internal sequencing to track._
- *The content source is a closed, hand-enumerated alphabet.* `create_game_mode`
  (`src/internal/game_modes.rs`) hard-codes a 40-entry jamo list for
  `"completion"`; `hangul_to_qwerty` (`src/internal/spawning.rs`) is a `match`
  over exactly those 40 entries, falling through to `""` for anything else.
  Extending the vocabulary --- numbers, colors, weekdays, animals --- is not a
  data change; it requires new match arms in a function whose contract is
  "hangul in, QWERTY key out," which has no way to represent a *word*'s
  answer as anything but a single (and, for anything not in the 40, silently
  empty) string.
  --- _Assumes: the content pool is fixed at the jamo alphabet's size._
- *Difficulty is calibrated for one keystroke and never re-examined per
  answer length.* `current_lifetime_ms` (`src/internal/engine.rs`) is one
  `u32` scalar, shared by every active reveal regardless of what it is, and
  `adjust_difficulty_faster`/`adjust_difficulty_slower` step it by a fixed
  `time_window_step_ms` on every match or miss. Nothing in the model asks
  "how many keystrokes did this reveal actually require," because today the
  answer is always exactly one.
  --- _Assumes: every unit of play costs the same amount of player time._
- *The content contract between `GameMode` and its host is an unchecked
  string, and it has already broken once.* `EndlessMode::get_next_character`
  (`src/internal/game_modes/endless.rs`) returns the literal string
  `Some("random")`, with the comment "Always return `\"random\"` to signal JS
  should pick randomly." No code in `packages/ui/honeycomb` reads that
  sentinel and substitutes an actual jamo (Proposition 2.1, below, exhibits
  this precisely). This is not a hypothetical failure mode the generalization
  ought to guard against --- it is a live one, already shipped, in the mode
  selectable today from `apps/www/src/lib/activity-catalog/catalog.ts`'s
  `"endless"` option.
  --- _Assumes: a bare string is a sufficient contract for "what to spawn
  next" across the WASM boundary._

Each symptom is shown below to be not a missing feature to bolt on, but
evidence that four independent layers of the engine have all, separately,
closed over "exactly one jamo" as if it were a law of the domain rather than
an arbitrary --- and, per \#705, now binding --- choice of representation.

#heading(level: 2, numbering: none)[P.1 · Computational characterization]

Strip away the honeycomb, the WASM boundary, and the Korean specifically.
What remains is: *spawn instances of a content pool against a board, match
player input against each instance's answer incrementally, adjust a single
difficulty scalar based on match/miss outcomes, and track completion of the
pool.* This is not a rendering problem (the SVG/hex geometry is orthogonal
and already correctly factored out into `some-hexagon`) and it is not a
timing-precision problem (the spawn/tick/expire loop already correctly
generalizes to anything with a lifetime). It is squarely a *content-model*
problem: the shape of "one unit of play" and "one correct answer" is baked in
at a granularity --- single jamo, single QWERTY token --- that the ADR's own
"richer exercise" (concept → recall → type-the-word) and \#705's stage
progression (letters → numbers/colors/shapes → weekdays/time/weather →
objects/animals/food/verbs) do not fit without breaking a type at every one
of the four layers named in P.0.

#heading(level: 2, numbering: none)[P.2 · Candidate fixes, and why three are rejected]

#table(
  columns: (3.4cm, 2.1cm, 1fr),
  stroke: 0.4pt,
  inset: 6pt,
  [*Candidate fix*], [*Verdict*], [*Decisive objection*],
  [Fork a parallel `WordEngine` beside the existing jamo engine],
  [Rejected],
  [Duplicates spawning, difficulty, scoring, persist-on-completion, and the
   ambiguity resolver (Definition 4.2) in two places that must then be kept
   in lockstep by hand. A jamo is, by Theorem 4.1 below, provably a
   one-token word --- a second engine is strictly less general than a
   unified one, not merely redundant with it.],
  [Pre-expand each word into $n$ back-to-back single-jamo `ActiveReveal`s,
   spawned one at a time as each is typed],
  [Rejected],
  [Destroys exactly the "concept → recall → type the *whole* word" loop
   \#705 asks for: the player would see one jamo at a time with no
   persistent stimulus, which is indistinguishable from today's completion
   mode except that the jamo happen to be drawn from a word list. It also
   cannot express a stimulus (image/icon/speech) that names the *whole*
   concept once, up front --- Definition 3.1's entire point.],
  [Keep `GameMode::get_next_character() -> Option<String>` as-is; smuggle
   a multi-jamo word through it as one long `String` and split it
   client-side],
  [Rejected],
  [Re-opens exactly the identity-continuity discipline \#421 already fixes
   for tokens: the engine, not the honeycomb layer, owns matching (ADR 0001
   §2(b): "composition is a correctness concern ... it belongs in the
   engine"). Parsing a flat string back into jamo boundaries client-side
   duplicates `hangul_to_qwerty`'s own knowledge of jamo composition in a
   second place, and gives client code exactly the kind of matching logic
   the engine exists to centralize.],
  [Generalize `ActiveReveal`'s single `expected_key: String` into an
   ordered answer sequence with a cursor, matched by a generalized version
   of the existing exact/prefix/ambiguous resolver, spawned by a `GameMode`
   whose contract returns a *challenge* object rather than a bare `String`],
  [*Accepted*],
  [Reuses every piece of scaffolding P.1 already correctly factored
   (spawn/tick loop, difficulty stepping, persist-on-completion, the
   phase-separated `EventBatch`) and touches exactly the four layers P.0
   shows are actually closed over "one jamo": the reveal's answer shape, the
   matcher, the `GameMode` contract, and the difficulty model. Nothing about
   rendering, timing precision, or the WASM boundary discipline needs to
   change.],
)

#remark("P.0")[
  The rejected middle two rows are not straw men: they are the two shortest
  paths an implementer under time pressure would actually reach for first
  (spawn several single-jamo reveals in a row; smuggle a word through the
  existing `String` field), and both are exactly the kind of *happy-path
  patch* the extensions canon's Amendment Protocol warns against --- a fix
  that silences the symptom (words appear to work) without addressing which
  of P.0's four closed commitments actually needed to open.
]

#heading(level: 2, numbering: none)[P.3 · The necessity of a unified matcher (derived, not decided)]

ADR 0001 §2(b) asserts that single-jamo play must become "the one-element
special case of sequence matching." This is stated there as a design
decision; it is proved here, because the proof is what licenses reusing one
matcher rather than forking two (P.2's rejected first row).

#proposition("P.1", name: "Jamo is a one-token word")[
  Let $kappa : "Jamo" -> "Key"$ be `hangul_to_qwerty`'s current mapping
  (§2 below). For every $j in "Jamo"$, the singleton sequence $w = (kappa(j))$
  is a well-formed answer sequence under the generalized `Answer` type of
  Definition 4.1, and matching $w$ under the token-cursor algorithm of
  Definition 4.2 is observationally identical, on every input, to matching
  `expected_key` under the present `process_input`.
]

#proof[
  By construction in §4 (Theorem 4.1): the generalized matcher's state is a
  cursor $c in {0, ..., |w|}$ into the answer sequence, compared against the
  buffer for the *current* token $w_c$ using exactly today's exact/prefix
  logic. For $|w| = 1$, $c in {0, 1}$, and the only reachable transition is
  $c: 0 -> 1$ on an exact match of $w_0$ against the buffer --- the same
  transition, on the same condition, `process_input` already performs
  (`swap_remove` + `handle_match`). No sequence of inputs can distinguish the
  two: the generalized matcher's "cursor at end" event and the present
  matcher's "reveal matched" event fire on the same buffer contents, at the
  same time, for the same reason.
]

#heading(level: 2, numbering: none)[P.4 · The mandatory factorization]

#theorem("P.2", name: "Four layers, not fewer")[
  Generalizing the engine past single-jamo play requires four *logically
  distinct* changes --- a *stimulus* type describing what the player
  perceives, an *answer sequence* type with cursor-based matching describing
  what they must produce, a *challenge-source* contract (`GameMode`,
  generalized) describing where challenges come from and when the pool is
  exhausted, and a *difficulty re-parametrization* describing how much time
  a challenge of a given shape is owed --- and no two of these may be
  collapsed without reintroducing one of P.0's symptoms.
]

#proof[
  *Stimulus $eq.not$ Answer:* a `Speech` stimulus and a `Glyph` stimulus can
  share the identical answer sequence (both mean "type 사과"); conflating the
  two would force every new modality to also be a new answer shape, which is
  false on its face. *Answer $eq.not$ challenge-source:* the same answer
  sequence (a `CompletionMode`-style jamo) is drawn from a pool with
  "master every element once" semantics today, but a future numbers-stage
  pool might want "master every element, gated by a prerequisite stage," per
  \#705's staged progression (§6.3) --- the matching algorithm must not need
  to know which completion policy is in force to correctly advance a cursor.
  *Challenge-source $eq.not$ difficulty:* `EndlessMode` and `CompletionMode`
  already correctly demonstrate this split today (neither mode computes a
  lifetime; `GameEngine` does), and Proposition 7.1 below shows that
  collapsing them --- letting a `GameMode` bake in its own timing --- is
  exactly how the present single-scalar difficulty model became invisible
  scope creep instead of a reviewable assumption. *Difficulty $eq.not$
  Stimulus/Answer:* the timing model must be a function of the answer's
  *shape* (its token count) without inspecting *what* the stimulus is, or a
  future modality (say, a slower-to-perceive `Speech` stimulus) would need
  its own bespoke difficulty branch instead of composing with the existing
  one. Four distinct concerns, no fewer, matching exactly ADR 0001's four
  independent stories (\#421 stimulus, \#422 answer/matching, \#423
  challenge-source, and the difficulty work this canon adds as \#422's
  unstated prerequisite).
]

#heading(level: 2, numbering: none)[P.5 · Progressive elimination of impossible worlds]

\#705's own example progression is, read formally, a descent that discards a
class of worlds the implementation need no longer consider at each stage:

+ *Stage 1 (today).* Only single-jamo, glyph-stimulus challenges exist. The
  world where an answer has more than one token is not yet representable.
+ *Stage 2 (numbers, colors, shapes).* Answers gain length; worlds where
  every answer is exactly one token collapse. Stimuli remain simple
  (a shape or color swatch is representable as `Glyph`/`Icon` without new
  machinery).
+ *Stage 3 (weekdays, time, weather, directions).* Stimuli gain modality:
  a clock face or weather icon is not text at all. Worlds where every
  stimulus is directly renderable as the answer text collapse.
+ *Stage 4 (objects, animals, food, verbs).* Vocabulary size and asset
  provenance (ADR 0001 §2(d), §5) become the binding constraint, not the
  engine's type model, which by this stage has already generalized enough
  to admit an arbitrarily large pool without further structural change.

By Stage 4 the engine's remaining degrees of freedom are content and
curriculum sequencing, not type shape --- which is the operational meaning of
"the fix falls out" once §2--§7 below are in place.

#heading(level: 2, numbering: none)[P.6 · The canon as a theory-revision system]

This document, like the extensions canon it mirrors, is filed as the object
future amendments revise, not as a one-time design note. A future report of
"word mode feels harder on stage 3 than stage 2 at the same settings" should
be triaged first against §7 (is the difficulty model actually normalized per
token, or did an implementation drift back to a per-challenge scalar) before
a stage-specific tuning constant is added --- exactly the discipline ADR
0001's own sequencing (\#421 → \#422 → \#423, then \#424 in parallel) already
assumes but does not, on its own, enforce.

#pagebreak()

// ═══════════════════════════════════════════════════════════════════════════
= Preliminaries and Notation
// ═══════════════════════════════════════════════════════════════════════════

#definition("1.1", name: "Universes")[
  Four sets are fixed:
  - $"Jamo"$ --- the closed, 40-element set of individual Hangul consonants
    and vowels presently enumerated in `create_game_mode`'s `"completion"`
    arm and `hangul_to_qwerty`'s match arms (`src/internal/game_modes.rs`,
    `src/internal/spawning.rs`).
  - $"Key"$ --- the QWERTY key-token alphabet: single characters for simple
    jamo (`"r"`, `"k"`, ...) and two-character composites for the eight
    ambiguous diphthong vowels (`"hk"`, `"ho"`, ...), exactly as returned by
    `hangul_to_qwerty`.
  - $"Cell"$ --- the set of hex-board cell identifiers, presently enumerated
    by `WasmGameBridge.generateCellIds()`
    (`packages/ui/honeycomb/src/lib/hangul/wasm-game-bridge/index.ts`) as the
    cube coordinates of a radius-4 hex board (61 cells).
  - $"Mode"$ --- the (presently two-element) set of `GameMode` string
    selectors, `{"endless", "completion"}`, dispatched by `create_game_mode`.
]

#definition("1.2", name: "The present answer map")[
  $ kappa : "Jamo" -> "Key" $
  is `hangul_to_qwerty`, a total function on `Jamo` realized as a Rust
  `match` with a catch-all `_ => ""`. $kappa$'s codomain is exactly the
  40-entry table also duplicated, independently, as `ALL_MAPPINGS` in
  `packages/ui/honeycomb/src/utils/hangul-keyboard-mapping/index.ts` (§9.2
  returns to this duplication).
]

#remark("1.1")[
  Nothing below assumes the content domain remains Korean specifically, or
  even linguistic. Every definition in §3--§7 is stated over an abstract
  `Stimulus`/`Answer` pair; §2's diagnosis is scoped to the present, Korean-
  specific instantiation only because that is what \#705 asks to be reviewed.
]

// ═══════════════════════════════════════════════════════════════════════════
= The Present Architecture --- A Formal Diagnosis
// ═══════════════════════════════════════════════════════════════════════════

This section states P.0's phenomenology precisely enough to prove, rather
than merely assert, that the present engine is overfit --- and exhibits two
concrete defects that are direct, already-manifested consequences of the
same root cause, not independent bugs.

== The four closed commitments

#definition("2.1", name: "Closed commitment")[
  A layer $L$ of the engine has a *closed commitment* to single-jamo play if
  $L$'s type signature admits no value representing an answer of length
  $> 1$ without a change to $L$'s own type, independent of any other layer.
]

#table(
  columns: (3.2cm, 3.6cm, 1fr),
  stroke: 0.4pt,
  inset: 6pt,
  [*Layer*], [*Present signature*], [*Why the commitment is closed*],
  [Reveal record],
  [`ActiveReveal { hangul: String, expected_key: String, ... }`
   (`src/internal/types.rs`)],
  [Both fields are scalar `String`s; there is no length-$n$ variant of this
   struct without changing its shape.],
  [Matcher],
  [`process_input` compares the whole key buffer against
   `r.expected_key` for each active reveal (`src/internal/engine.rs`)],
  [The comparison is `r.expected_key == buffer_str`, a single equality; a
   sequence needs a cursor, which no field here carries.],
  [Content source],
  [`GameMode::get_next_character(&mut self) -> Option<String>`
   (`src/internal/game_modes.rs`)],
  [The trait method's return type is one `String`; it cannot return a
   stimulus-plus-answer pair without changing the trait itself.],
  [Difficulty],
  [`current_lifetime_ms: u32`, one scalar shared by every active reveal
   (`src/internal/engine.rs`)],
  [The lifetime is not a function of what was spawned; it has no place to
   record "this reveal needs $n$ times the budget."],
)

#proposition("2.1", name: "The four commitments are independent")[
  No single-layer change discharges more than one row of the table above:
  changing `ActiveReveal`'s fields alone does not change what `GameMode`
  returns; changing the matcher alone has nothing to iterate over without a
  sequence-typed field to match against; changing the `GameMode` contract
  alone still hands a single-jamo answer to an unchanged matcher; and
  reparametrizing difficulty alone changes nothing about what can be spawned
  or matched.
]

#proof[
  Immediate from Definition 2.1: each row's closure is witnessed by a
  distinct type signature, none of which appears as a parameter or return
  type of any other row's function. A change confined to one signature
  cannot alter a disjoint signature's admissible values.
]

#remark("2.1")[
  Proposition 2.1 is the formal reading of \#705's own diagnosis --- "there
  is an architectural issue ... the modules are overfit." The overfitting is
  not one bug in one function; it is four independent closures that all
  happen to agree on the same limiting case, which is exactly why a
  single-layer patch (P.2's rejected middle rows) always feels like it
  *almost* works and then fails at the next layer down.
]

== The undischarged content contract

The `"random"` sentinel in `EndlessMode` is not hypothetical evidence for
the diagnosis above; it is exhibited, present-tense evidence that a
string-typed content contract across the `GameMode` boundary has already
silently broken once, in code shipping today.

#proposition("2.2", name: "The endless-mode sentinel resolves to nothing")[
  `EndlessMode::get_next_character` (`src/internal/game_modes/endless.rs`)
  unconditionally returns `Some(String::from("random"))`. `spawn_character`
  (`src/internal/engine.rs`) passes this string directly to
  `spawning::hangul_to_qwerty`, whose match arms cover only the 40 entries
  of `Jamo` and fall through, for `"random"`, to `_ => ""`. No file under
  `packages/ui/honeycomb` inspects a spawned `hangul` value for the literal
  `"random"` and substitutes an actual jamo before display or matching,
  despite `getRandomHangul()` existing, unused for this purpose, in
  `packages/ui/honeycomb/src/utils/hangul-keyboard-mapping/index.ts`. The
  mode is not dead code: it is user-selectable today as `"endless"` /
  "survive as long as you can" in
  `apps/www/src/lib/activity-catalog/catalog.ts`.
]

#proof[
  By direct trace of the three files named, and by grep: no occurrence of
  the string `"random"` exists in `packages/ui/honeycomb` outside
  `hangul-game-core`'s own compiled output and its Rust source and tests.
  The comment at `endless.rs`'s `get_next_character` --- "Always return
  `\"random\"` to signal JS should pick randomly" --- documents an intended
  contract between the engine and its host that the host does not, in fact,
  implement.
]

#corollary("2.2.1")[
  Every `CharacterSpawned` event emitted while `"endless"` mode is active
  carries `spawnResult.hangul === "random"` and `spawnResult.expectedKey ===
  ""`. Any cell displaying it renders the literal text "random" instead of a
  glyph, and no keystroke can ever match it: the exact-match check
  (`r.expected_key == buffer_str`) can never succeed against an empty
  string paired with any non-empty buffer, and the prefix check
  (`r.expected_key.starts_with(&buffer_str) && r.expected_key.len() >
  buffer_str.len()`) can never hold either, since an empty string has no
  characters to extend. Endless mode, as currently wired, cannot be won on
  any cell it spawns via this path.
]

#remark("2.2", name: "Why this is the right kind of evidence for a post-mortem")[
  Corollary 2.2.1 is not filed here to assign blame; it is filed because it
  is the sharpest available demonstration of Proposition 2.1's point in
  miniature. The contract "what should be spawned next" was carried across
  the `GameMode`/host boundary as a bare, uninterpreted `String`, and it
  broke the instant the two sides' assumptions about that string diverged ---
  exactly the failure mode a *typed* `Stimulus`/`Answer` boundary (§3--§6)
  is designed to make impossible by construction, because a mismatched
  variant is a compile error or a schema-parse error (§9), not a silent
  runtime no-op.
]

== A second, independent instance: divergent default configuration

#proposition("2.3", name: "Two defaults, one silently unused")[
  `GameConfig::default()` (`src/internal/types.rs`) sets
  `correctness_threshold_ms: 600`. `DEFAULT_GAME_CONFIG`
  (`packages/ui/honeycomb/src/lib/hangul/wasm-game-bridge/index.ts`) sets
  `correctnessThresholdMs: 1500`. Every other field of the two structures
  agrees exactly. Because `loadHangulWasm`
  (`packages/ui/honeycomb/src/lib/hangul/hangul-wasm-runtime.ts`) always
  merges a fully-populated `DEFAULT_GAME_CONFIG` before constructing
  `HangulGameCore`, and `HangulGameCore::new` only falls back to
  `GameConfig::default()` when `serde_wasm_bindgen::from_value` *fails*
  (`src/lib.rs`), the Rust default of `600` is unreachable in production:
  every real game session runs at a "high quality" match threshold of
  `1500`ms, two and a half times looser than the value an engineer reading
  only the Rust source would believe governs it.
]

#proof[
  Direct comparison of the two literals, and direct trace of
  `loadHangulWasm` → `WasmGameBridge` construction, which passes
  `GameConfigSchema.parse({...DEFAULT_GAME_CONFIG, ...pendingConfig})` --- a
  value that is total over `GameConfigSchema`'s required fields whenever
  `pendingConfig` is omitted or partial --- so `serde_wasm_bindgen::from_value`
  never fails on the happy path, and the Rust default is never consulted.
]

#remark("2.3")[
  This is a smaller defect than Proposition 2.2's --- it degrades calibration
  rather than breaking a mode outright --- but it is the same species of
  failure: a value duplicated, unchecked, across the WASM boundary, with
  nothing (not the serde/zod parity discipline of §9, which only validates
  *shape*, not cross-language *value* agreement) positioned to catch the two
  copies drifting apart. §9 states this precisely as a limitation of parity
  checking, not a gap it happens to have missed.
]

== What must not change

Not every layer is implicated. Stating this explicitly matters as much as
naming what is broken, per ADR 0001's own constraint that "single-jamo play
must keep working":

- The spawn/tick/expire loop (`GameEngine::spawn_character`, `tick`) is
  already correctly generic over *what* is spawned; it manipulates
  `cell_id` and timestamps, never `hangul` or `expected_key`'s content.
- The phase-separated `EventBatch` (primary / secondary / UI-hint,
  `src/internal/events.rs`) is already the right shape for a generalized
  `AnswerProgress` UI hint (§8) to slot into.
- Persist-on-completion (`completed_cells: Vec<String>`) already generalizes
  to "a challenge, once fully matched, reserves its cell(s)" without any
  change to its own logic (§5 addresses the one open question this raises:
  whether a challenge can span more than one cell).
- The engine's browser-free invariant (`engine.rs`'s own header comment,
  "The pure Rust game engine - no WASM dependencies") is already exactly the
  constraint ADR 0001 §2(a) reaffirms for `Stimulus`, and needs no new
  enforcement, only a new axiom stating it over the new type (Axiom 3.1).

#pagebreak()

// ═══════════════════════════════════════════════════════════════════════════
= The Stimulus Algebra
// ═══════════════════════════════════════════════════════════════════════════

#definition("3.1", name: "Stimulus")[
  A *stimulus* is a value of the sum type
  $ "Stimulus" ::= "Glyph"(g) | "Image"(a) | "Icon"(n) | "Speech"(a?, t?), $
  where $g$ is a Hangul glyph string (today's behavior, preserved exactly),
  $a$ is an opaque asset identifier, $n$ is an opaque icon name, and a
  `Speech` stimulus carries an optional audio asset reference and/or an
  optional TTS text. This is ADR 0001 §2(a)'s type, restated as a formal
  object so Axiom 3.1 can be stated over it precisely.
]

#axiom("3.1", name: "Asset opacity (the browser-free invariant, generalized)")[
  The engine holds and compares only stimulus *identifiers* --- variant tag
  plus opaque id/ref --- never pixels, audio samples, or any renderable
  payload. Resolution from identifier to renderable source is entirely the
  host layer's responsibility.
]

#proposition("3.1", name: "Axiom 3.1 is not a new constraint")[
  Axiom 3.1 is satisfied trivially by the present engine and requires no new
  enforcement mechanism, only extension of an invariant already present:
  `hangul: String` today is already an identifier (a glyph *string*, not a
  rendered glyph), resolved to a rendered form only by
  `HangulHexCell`'s SVG text node
  (`packages/ui/honeycomb/src/components/hangul-hex-grid/hangul-hex-cell/index.tsx`).
  A `Glyph` stimulus is definitionally identical to today's field; `Image`,
  `Icon`, and `Speech` are the same discipline applied to three new
  identifier kinds, resolved by three new (host-side) lookup tables,
  analogous to `ALL_MAPPINGS`'s existing hangul → romanization/color lookup.
]

#proof[
  By inspection: `engine.rs`'s own header comment already asserts "no WASM
  dependencies," and no function in `src/internal/` performs image
  decoding, audio decoding, or DOM access today. Adding three more opaque-id
  variants to a sum type introduces no new capability the engine did not
  already refrain from exercising.
]

#pagebreak()

// ═══════════════════════════════════════════════════════════════════════════
= The Answer Sequence and the Generalized Matcher
// ═══════════════════════════════════════════════════════════════════════════

== The answer type

#definition("4.1", name: "Answer sequence")[
  An *answer* is a non-empty ordered sequence
  $ w = (w_0, w_1, ..., w_(n-1)) in "Key"^+ $
  of QWERTY key-tokens. A *word* is any answer with $n > 1$; today's single
  jamo is, per Proposition P.1, the case $n = 1$.
]

#definition("4.2", name: "Active challenge")[
  An *active challenge* generalizes `ActiveReveal` to
  $ C = ("stimulus", w, c, "revealed_at_ms", "cell_ids"), $
  where $"stimulus" in "Stimulus"$ (Definition 3.1), $w$ is an answer
  (Definition 4.1), $c in {0, ..., |w|}$ is the *cursor*: the number of
  tokens of $w$ already matched, and $"cell_ids"$ is a non-empty set of
  board cells the challenge occupies (§5 discusses why this is a set rather
  than the present single `cell_id`).
]

== The generalized matcher

#definition("4.3", name: "Token-cursor matching")[
  Fix the global key buffer $b$ maintained exactly as today (a stale-pruned
  sequence of recent keystrokes, `buffer_timeout_ms`-gated). For an active
  challenge $C$ with cursor $c$, define the *current expected token*
  $t(C) = w_c$. The matcher's resolution of $b$ against the set of all
  active challenges is exactly today's exact/prefix/ambiguous logic
  (`process_input`, `src/internal/engine.rs`), with every occurrence of
  $r."expected_key"$ replaced by $t(C)$:
  - *Exact, unambiguous:* some $C$ has $t(C) = b$ and no other active $C'$
    has $t(C')$ properly extending $b$. Advance $C$'s cursor: $c := c + 1$.
    If $c = |w|$, the challenge is *complete* (today's `handle_match`); else
    emit `AnswerProgress` (§8) and clear only the *token* buffer, leaving the
    challenge active.
  - *Ambiguous:* an exact match exists for some $C$ but some other active
    $C'$ has $t(C')$ properly extending $b$ --- identical in shape to today's
    `AmbiguousInput`, now keyed on current tokens rather than whole answers.
  - *Partial:* no exact match, but some $t(C)$ properly extends $b$ ---
    identical to today's `BufferUpdated`.
  - *Miss:* neither of the above --- identical to today's `InputMissed`.
]

#theorem("4.1", name: "Single-jamo matching is the $n=1$ specialization")[
  For every active challenge with $|w| = 1$, Definition 4.3's algorithm is
  observationally identical, on every reachable input sequence, to the
  present `process_input`.
]

#proof[
  For $|w| = 1$, $c in {0, 1}$ and $t(C) = w_0$ is constant until the single
  reachable transition $c: 0 -> 1$, which is exactly `handle_match`'s
  `swap_remove` (there is no "partially advanced, still active" state to
  reach, since $c = 1 = |w|$ is immediately terminal). Substituting $t(C)$
  for $w_0$ for `r.expected_key` in every one of the four cases above
  recovers `process_input`'s four branches verbatim: the exact/ambiguous
  distinction depends only on whether some *other* active entry's current
  token properly extends $b$, which is exactly today's cross-reveal
  `starts_with` check, unchanged in shape. By Proposition P.1 this is not a
  coincidence of notation but the intended reduction.
]

#corollary("4.1.1", name: "Regression coverage is definitional, not empirical")[
  Because Theorem 4.1 is a proof of observational equivalence rather than an
  empirical regression suite, the existing single-jamo tests in
  `src/internal/engine.rs`'s `#[cfg(test)] mod tests` continue to specify
  the generalized matcher's behavior at $n=1$ exactly, with no new test
  needed to state "single-jamo play still works" as a *fact about the
  algorithm*. New tests are needed only for $n > 1$ behavior the old suite
  never exercised (cursor advancement, mid-word ambiguity, `AnswerProgress`
  emission), which is a smaller, better-targeted surface than "re-verify
  everything."
]

#remark("4.1", name: "The per-answer timeout window, reconciled")[
  ADR 0001 §2(b) flags the per-keystroke `buffer_timeout_ms` staleness
  window as needing reconciliation "into a per-answer window." Definition
  4.3 resolves this precisely: `buffer_timeout_ms` continues to gate *within
  a single token* exactly as today (a player pausing mid-diphthong should
  still have the partial buffer expire), while the *challenge's* own
  lifetime (§7) is the separate, per-answer budget governing how long the
  whole word may take. The two timeouts operate at different granularities
  and neither subsumes the other --- the same two-granularity pattern the
  extensions canon's Corollary 5.2.1 identifies for epoch versus per-key
  identity checks, recurring here because it is the same kind of problem
  (a single mechanism was doing two jobs at two scales) at a different
  layer.
]

#pagebreak()

// ═══════════════════════════════════════════════════════════════════════════
= The Challenge Object and Board Geometry
// ═══════════════════════════════════════════════════════════════════════════

#definition("5.1", name: "Challenge")[
  A *challenge* is the pairing $("stimulus", w)$ of Definitions 3.1 and 4.1,
  independent of any board placement. An *active* challenge (Definition 4.2)
  is a challenge bound to one or more board cells and a reveal timestamp.
]

#remark("5.1", name: "An open decision \#705's own text leaves undischarged")[
  \#705's Honeycomb Word Mode narrative states: "One or more cells in the
  honeycomb become highlighted or obscured with a '?' state." This sentence
  is compatible with two materially different board bindings, and this
  canon deliberately does not resolve the choice --- it flags it as a
  precondition that must be settled *before* \#425 (stimulus-aware hex
  cells) is implemented, exactly as ADR 0001 §2(b) defers its own raw-jamo-
  vs-syllable-composition choice to \#422 rather than guessing:
  + *Single-cell binding.* One challenge occupies exactly one cell (today's
    model, unchanged): the cell shows the stimulus, the player types the
    full answer with that one cell as the sole visual anchor.
  + *Multi-cell binding.* A challenge occupies $|w|$ (or some syllable-
    block count) of cells simultaneously, each obscured until its
    corresponding token is typed --- a materially larger change, since
    `completed_cells`' reservation logic and `SpawnResult`'s single
    `cell_id` field both assume one challenge reserves exactly one cell.
  Single-cell binding is the strictly smaller change and satisfies every
  requirement of \#705's narrative (a highlighted cell, a "?" state, a
  concept overlay driving the prompt) without touching cell-reservation
  arithmetic at all; multi-cell binding is not ruled out by anything proved
  here, but this canon takes no position on which \#423/\#425 should
  implement, and the choice must be recorded as an amendment (§11) before
  either lands.
]

#proposition("5.1", name: "Board sizing is a content-coupled assumption, not yet a broken one")[
  `HANGUL_GRID_RADIUS = 4` (`wasm-game-bridge/index.ts`) is sized, by its
  own comment, to exceed the 40-jamo completion pool "with room to spare"
  (61 cells). This sizing rationale is coupled to the present content pool's
  cardinality. It is not violated by any change proposed above --- single-
  cell binding leaves cell count untouched regardless of vocabulary size ---
  but a curriculum stage whose pool is much larger than 40 entries (\#705's
  Stage 4: objects, animals, food, verbs) will, under single-cell binding,
  need only as many *simultaneously active* cells as the difficulty model
  ever spawns at once, which is already bounded independently of pool size.
  Board resizing is therefore not forced by any generalization in this
  canon; it remains a free, later, content-driven decision.
]

#pagebreak()

// ═══════════════════════════════════════════════════════════════════════════
= The `GameMode` Contract, Generalized
// ═══════════════════════════════════════════════════════════════════════════

== The generalized trait

#definition("6.1", name: "Generalized `GameMode`")[
  The trait's content-producing method generalizes from
  `fn get_next_character(&mut self) -> Option<String>` to
  `fn get_next_challenge(&mut self) -> Option<Challenge>` (Definition 5.1);
  `on_match`'s `hangul: &str` parameter generalizes to the completed
  challenge's identity (sufficient to key `completed_characters`-style
  bookkeeping); every other method (`initialize`, `on_miss`, `is_complete`,
  `get_progress`, `reset`) is unchanged in shape.
]

#proposition("6.1", name: "`EndlessMode` and `CompletionMode` are degenerate instances")[
  Both existing modes are recoverable, verbatim in behavior, as callers of
  `get_next_challenge` that always return a length-1, `Glyph`-stimulus
  challenge: `EndlessMode` returns a challenge wrapping a *genuinely* random
  jamo (discharging Proposition 2.2's undelivered contract, since the
  engine itself, not an unread string, now performs the random choice) and
  `CompletionMode` returns one drawn from `incomplete_characters` exactly as
  today.
]

#proof[
  Direct substitution: `Challenge { stimulus: Glyph(j), answer: (kappa(j),) }`
  for a chosen $j in "Jamo"$ is a well-formed, length-1
  `Challenge` under Definitions 3.1 and 4.1 for every $j$ currently produced
  by either mode; no information present in the current `String`-returning
  implementations is lost by this substitution, and Corollary 2.2.1's defect
  is resolved as a side effect --- `EndlessMode` no longer emits a sentinel
  the matcher cannot resolve, because it now returns an actual answer
  sequence rather than a magic string.
]

== A staged curriculum mode

#definition("6.2", name: "Staged curriculum")[
  A *staged curriculum* is an ordered list of pools $(P_1, ..., P_m)$ ---
  \#705's Stage 1 through Stage 4 --- with a monotonic unlock predicate:
  stage $i+1$ is eligible to spawn only once stage $i$'s
  `CompletionMode`-style mastery fraction exceeds a configured threshold.
  Within an unlocked stage, challenge selection is exactly `CompletionMode`'s
  existing random-choice-from-incomplete-pool policy, reused rather than
  reinvented.
]

#proposition("6.2", name: "Staged curriculum requires no new matching or spawn machinery")[
  A `StagedCurriculumMode` is expressible entirely as composition of $m$
  `CompletionMode`-shaped sub-pools plus the single unlock predicate of
  Definition 6.2; it introduces no new case in `GameEngine::spawn_character`,
  `tick`, or the matcher, all of which operate uniformly over whatever
  `Challenge` a `GameMode` hands them.
]

#proof[
  Immediate from Theorem P.2 (the four-layer factorization): the
  challenge-source layer is, by construction, the only layer a new
  `GameMode` implementation touches. `spawn_character` and the matcher were
  shown in §2's "what must not change" to already be generic over challenge
  content.
]

== A concrete, real inconsistency the generalized contract closes

#remark("6.1", name: "Completion semantics are presently coupled to an unrelated hint setting")[
  `CompletionMode::on_match` (`src/internal/game_modes/completion.rs`) counts
  a match toward mastery *only if* `show_romanization` is `false` --- i.e.,
  only once the player's global streak has exceeded
  `config.hide_romanization_streak`. Mastery of one specific jamo is
  therefore gated by a *global*, streak-based hint-visibility threshold that
  has no logical connection to that jamo individually: a player who has
  never seen this particular jamo before, but who currently has a five-match
  streak on *other* jamo, gets it counted as "mastered" on first sight,
  purely because romanization happened to already be hidden. This is the
  same category of accidental coupling Proposition 2.1 names for the four
  closed commitments, recurring one level down inside a single mode.
  Definition 6.1's generalized contract does not, by itself, fix this --- it
  is flagged here as a pre-existing defect worth correcting in the same pass
  as \#423, since a `StagedCurriculumMode`'s per-pool mastery bookkeeping
  will otherwise inherit the identical coupling at every stage.
]

#remark("6.2", name: "Remark 6.1's own resolution was wrong: the gate is a required invariant, not a defect")[
  \#423's implementation resolved Remark 6.1 by deleting the
  `!show_romanization` condition outright, decoupling mastery from hint
  visibility entirely. Direct product feedback overturned that resolution:
  the gate must stay, in `CompletionMode` and in every other `GameMode`
  (`EndlessMode`, `VocabularyMode`'s both variants) that reports whether a
  match `counts_toward_completion`. The reasoning Remark 6.1 gave --- that
  `show_romanization` is a *global* signal built from streak across other
  challenges, not a fact about the one just matched --- is correct as an
  observation but wrong as an objection. There is exactly one
  hint-visibility setting for the whole board (`GameEngine::get_timing_params`);
  a match made while it reads `true` is, definitionally, a match the player
  could have produced by reading the on-screen QWERTY hint rather than
  recalling it, regardless of which challenge built the streak that hid or
  showed it. Crediting that match toward mastery or cell persistence
  rewards the crutch, not the recall. The corrected contract: `on_match`
  requires `!show_romanization` in every implementation
  (`src/internal/game_modes/{completion,vocabulary,endless}.rs`), in
  addition to whatever `is_high_quality` check a mode already performed. A
  `StagedCurriculumMode` inherits this corrected gate automatically, the
  same way Remark 6.1 warned it would otherwise inherit the coupling.
]

#pagebreak()

// ═══════════════════════════════════════════════════════════════════════════
= Difficulty and Timing Invariance Under Variable Answer Length
// ═══════════════════════════════════════════════════════════════════════════

This section is this canon's principal original contribution beyond
formalizing ADR 0001: neither the ADR nor \#705's narrative states what
happens to the difficulty model once an answer is no longer always length 1,
and the naive extension is silently wrong.

== The naive extension, and why it is incoherent

#definition("7.1", name: "Naive lifetime extension")[
  The *naive* extension keeps `current_lifetime_ms` as a single scalar,
  applied unchanged as the entire challenge's lifetime regardless of
  $|w|$: a 4-token word and a 1-token jamo, spawned at the same difficulty
  setting, are given the identical deadline.
]

#proposition("7.1", name: "Naive extension drives per-token budget below the engine's own floor")[
  Let $ell = "current_lifetime_ms"$ (today's semantics: the time budget for
  exactly one keystroke's worth of decision). Under Definition 7.1, an
  $n$-token challenge's *effective per-token* budget is $ell \/ n$. Taking
  \#705's example word 사과 (romanized _sa-gwa_, decomposing to the
  four jamo ㅅ, ㅏ, ㄱ, ㅘ) at a moderate difficulty setting
  $ell = 1500"ms"$ gives an effective per-token budget of $375"ms"$ ---
  below `difficulty::calculate_spawn_interval`'s own `min_spawn = 800.0`
  constant (`src/internal/difficulty.rs`), which the engine's *own*
  difficulty model treats as the fastest sane cadence at which a new
  single-jamo challenge should ever be presented. The naive extension
  therefore demands, for any word of length $n gt.eq 2$ at this setting, a
  per-token decision speed the engine's own difficulty curve asserts,
  elsewhere in the same file, is unreasonably fast.
]

#proof[
  Arithmetic: $1500 \/ 4 = 375 < 800$. The comparison is meaningful because
  both constants are calibrated, independently, against the same
  underlying quantity --- "how fast can a player plausibly recall-then-type
  one jamo" --- so an internal inconsistency between them is a real
  incoherence in the model, not an artifact of comparing unlike units.
]

#corollary("7.1.1", name: "The incoherence compounds across curriculum stages")[
  Because \#705's stage progression strictly increases typical answer
  length (Stage 1: $n=1$ always; Stage 4: multi-jamo, multi-syllable words),
  the naive extension makes every later stage *systematically* harder than
  an earlier one at the identical nominal difficulty setting, purely as an
  artifact of answer length --- not because the vocabulary is conceptually
  harder, which is the only axis \#705's progression intends to vary.
]

== The corrected model

#theorem("7.2", name: "Per-token normalization is necessary for cross-stage coherence")[
  A difficulty model is coherent across answer lengths only if (a) a
  challenge's total time budget is computed as $n dot ell$ for a per-token
  budget $ell$ held constant across challenge shapes at a given difficulty
  setting, and (b) the streak-driven stepping of $ell$ itself
  (`speed_increase_every_n_correct`, `time_window_step_ms`) triggers on
  *tokens matched*, not *challenges completed*.
]

#proof[
  (a) is immediate from Proposition 7.1: any allocation that does not scale
  linearly with $n$ reproduces the same per-token-budget distortion at
  some length. (b) follows because `speed_increase_every_n_correct`'s
  present meaning --- "the player has now correctly produced $N$ keystrokes
  at the current speed, so tighten it" --- is a statement about
  *keystroke* volume; counting *challenges* instead means a curriculum
  stage with longer average answers reaches each difficulty step after
  *fewer* challenges but the *same* number of keystrokes as a shorter-answer
  stage would, which is consistent, whereas counting challenges while
  reading the step as "so many correct answers" silently redefines what a
  "correct" unit means from stage to stage.
]

#corollary("7.2.1", name: "The minimal-diff fix")[
  Reinterpret `current_lifetime_ms` as the *per-token* budget it already
  functions as at $n=1$ (no change in stored representation or default
  value is required); compute a challenge's actual expiry in `tick` as
  $"revealed_at_ms" + n dot "current_lifetime_ms"$, clamped to a configured
  ceiling so that pathologically long answers cannot park a cell
  indefinitely; and change `adjust_difficulty_faster`/`_slower`'s trigger
  from `self.stats.current_streak % speed_increase_every_n_correct` to a
  running count of *tokens* matched. Every existing single-jamo test
  continues to hold unmodified, since $n = 1$ makes the corrected formula
  identical to today's: $"revealed_at_ms" + 1 dot ell = "revealed_at_ms" +
  ell$, and one token matched is one token matched under either counting
  scheme.
]

#remark("7.1")[
  This is the load-bearing prerequisite ADR 0001 leaves implicit for its own
  \#423 (`VocabularyMode`): without Theorem 7.2, tuning each curriculum
  stage's difficulty independently is tuning against a moving, length-
  confounded target, and any resulting per-stage constants will need to be
  re-derived the moment answer-length distribution within a stage changes ---
  exactly the kind of downstream churn the extensions canon's Amendment
  Protocol exists to head off by fixing the underlying model first.
]

#pagebreak()

// ═══════════════════════════════════════════════════════════════════════════
= The Event Algebra, Generalized
// ═══════════════════════════════════════════════════════════════════════════

#definition("8.1", name: "`AnswerProgress`")[
  A new `UiHintEvent` variant, `AnswerProgress { cell_ids, composed_so_far,
  remaining, cursor, total }`, generalizing today's `BufferUpdated` (which
  carries only the raw keystroke buffer) to also carry sequence-level
  progress. `BufferUpdated` and `AmbiguousInput` are unchanged in shape ---
  Definition 4.3 keyed both on the *current token* precisely so that no
  change to their payloads is forced.
]

#proposition("8.1", name: "`MatchFound`'s `hangul: String` field must be widened")[
  `PrimaryEvent::MatchFound`'s `hangul: String` field (`src/internal/events.rs`)
  presently carries the single completed glyph. For a completed word
  challenge, the analogous payload is the full answer's glyph/word
  representation, not a single jamo; this field must widen to accommodate
  it, or the honeycomb layer's "which glyph just completed" display logic
  silently regresses to showing only the last jamo typed.
]

#proof[
  By inspection of `handle_match` (`src/internal/engine.rs`), which
  constructs `MatchFound { hangul: reveal.hangul, ... }` directly from the
  (presently scalar) `ActiveReveal.hangul` field; under Definition 4.2 the
  analogous source field is the challenge's stimulus/answer pair, not a
  bare string, so the event payload must be re-derived from it rather than
  copied unchanged.
]

#remark("8.1", name: "Every payload change here is additive or type-widening, never removing")[
  No existing `GameEvent` variant loses a field under this section's
  changes; `InputMissed`, `CharactersExpired`, `BoardFull`,
  `DifficultyChanged`, `StreakMilestone`, and `StatsUpdated` are entirely
  unaffected, since none of them carries answer-shaped data today. This
  bounds the blast radius of the wire-format change to exactly the two
  events named above.
]

#pagebreak()

// ═══════════════════════════════════════════════════════════════════════════
= The Serde ⇄ Zod Boundary Discipline
// ═══════════════════════════════════════════════════════════════════════════

#axiom("9.1", name: "Shape parity")[
  Every field added to a `#[derive(Serialize)]` payload crossing the WASM
  boundary must be added, with a matching camelCase name, to the
  corresponding zod schema in `wasm-game-bridge/index.ts` in the same
  change. This is already the discipline `GameEventSchema`'s discriminated
  union and `GameConfigSchema` enforce today for every existing field.
]

#proposition("9.1", name: "Parity checks shape, not cross-language value agreement")[
  Axiom 9.1, fully honored, would still not have caught Proposition 2.3's
  default-config drift: both `600` and `1500` are valid `number`s under
  `GameConfigSchema`'s `z.number().positive()` constraint on
  `correctnessThresholdMs`. Shape parity is necessary but not sufficient for
  cross-language behavioral agreement; a second, distinct discipline ---
  either a single source of truth for default values (generated into both
  languages) or an explicit cross-language equality test --- is required to
  close the gap Axiom 9.1 does not cover.
]

#proof[
  Direct from Definition of `z.number().positive()`: it is satisfied by
  both `600` and `1500` identically, so no schema failure is triggered by
  either value regardless of which one is actually in force.
]

#corollary("9.1.1", name: "Applying this to the present generalization")[
  Every new field introduced by §3--§8 (`Stimulus`'s variant tag and payload,
  `Answer`'s sequence, `AnswerProgress`'s cursor/total, `MatchFound`'s
  widened payload) must land with its zod counterpart in the same commit,
  per Axiom 9.1 --- and, per Proposition 9.1, any new *default value*
  introduced for a `Stimulus`/`Answer`-shaped config field should be defined
  once and threaded to both languages rather than declared independently
  twice, to avoid reproducing Proposition 2.3's exact failure mode on new
  ground.
]

#pagebreak()

// ═══════════════════════════════════════════════════════════════════════════
= Grounding Against Production Source
// ═══════════════════════════════════════════════════════════════════════════

This canon is not an abstract exercise; every definition above is stated so
that it is checkable, today, against a specific file and identifier.

#table(
  columns: (auto, auto),
  stroke: 0.4pt,
  [*Canonical object*], [*Present source*],
  [`Jamo`, $kappa$ (Def. 1.1--1.2)], [`hangul_to_qwerty` match arms, `src/internal/spawning.rs`; duplicated as `ALL_MAPPINGS`, `packages/ui/honeycomb/src/utils/hangul-keyboard-mapping/index.ts`],
  [Closed commitments (Def. 2.1)], [`ActiveReveal`, `GameMode::get_next_character`, `hangul_to_qwerty`, `current_lifetime_ms` --- all in `crates/hangul-game-core/src/internal/`],
  [Undischarged content contract (Prop. 2.2)], [`EndlessMode::get_next_character`'s `"random"` sentinel, `src/internal/game_modes/endless.rs`, unconsumed anywhere in `packages/ui/honeycomb`],
  [Divergent defaults (Prop. 2.3)], [`GameConfig::default()`, `src/internal/types.rs` vs. `DEFAULT_GAME_CONFIG`, `wasm-game-bridge/index.ts`],
  [Stimulus (Def. 3.1)], [ADR 0001 §2(a)'s proposed enum; not yet implemented],
  [Answer sequence, cursor matcher (Def. 4.1--4.3)], [Generalizes `ActiveReveal.expected_key` and `GameEngine::process_input`, `src/internal/engine.rs`],
  [Challenge, board binding (Def. 4.2, 5.1)], [Generalizes `ActiveReveal`/`SpawnResult`'s `cell_id: String`; cell pool from `WasmGameBridge.generateCellIds()`, `wasm-game-bridge/index.ts`],
  [Generalized `GameMode` (Def. 6.1)], [`src/internal/game_modes.rs`'s trait; `EndlessMode`/`CompletionMode` as degenerate instances (Prop. 6.1)],
  [Completion/hint coupling defect and its corrected resolution (Rem. 6.1--6.2)], [`!show_romanization` gate on every `GameMode::on_match`, `src/internal/game_modes/{completion,vocabulary,endless}.rs`],
  [Difficulty scalar, spawn-interval floor (§7)], [`current_lifetime_ms`, `adjust_difficulty_faster`/`_slower`, `src/internal/engine.rs`; `min_spawn = 800.0`, `src/internal/difficulty.rs`],
  [Event algebra (§8)], [`PrimaryEvent`, `SecondaryEvent`, `UiHintEvent`, `GameEvent`, `EventBatch`, `src/internal/events.rs`],
  [Serde⇄zod parity (§9)], [`GameEventSchema`, `GameConfigSchema`, `wasm-game-bridge/index.ts`],
  [`ContentDomain` (Def. 11.1)], [Generalizes `hangul_to_qwerty`, `src/internal/spawning.rs`, and `create_game_mode`'s 40-entry list, `src/internal/game_modes.rs`; `Korean` is the sole present implementation],
  [API-authority axiom (Ax. 11.1)], [`hangul-game-core`'s `internal::GameEngine`/`HangulGameCore` split, `src/lib.rs`; independently attested by `leetype_wasm`'s `TypingGameCore`/`TypingGame` split, `crates/leetype_wasm/src/{game_core,lib}.rs`],
  [Crate-boundary judgment (Prop. 11.3--11.4)], [Compares `leetype_wasm/src/leetype/validation.rs`'s single-target validator against `hangul-game-core`'s multi-target matcher (Def. 4.3); to be ratified as `crates/hangul-game-core/docs/adr/0002-content-domain-genericity-and-crate-boundary.md`],
)

#pagebreak()

// ═══════════════════════════════════════════════════════════════════════════
= Content-Domain Genericity and the Crate-Boundary Question
// ═══════════════════════════════════════════════════════════════════════════

Everything in §1--§10 was stated over a fixed content domain: Korean jamo,
QWERTY keys, and the specific 40-entry alphabet `create_game_mode` and
`hangul_to_qwerty` close over. Nothing in \#705 or ADR 0001 asks whether that
domain itself should stay fixed. This section states that requirement
explicitly --- "today Korean, tomorrow perhaps HSK Chinese, who knows" is a
paraphrase of an actual constraint, not a hypothetical --- derives what it
costs, and, because generalizing a crate's content domain immediately raises
the question of where its logic should physically live, settles that
question too by comparison against a second, structurally analogous crate
already in this repository.

== A fifth closed commitment, hidden behind the other four

#definition("11.1", name: "Content domain")[
  A *content domain* $D$ is the tuple $ D = ("Token"_D, "Key"_D, kappa_D, A_D), $
  generalizing Definition 1.1--1.2: $"Token"_D$ is $D$'s atomic unit (a
  jamo, a Hanzi, a digit --- whatever the smallest thing a challenge can ask
  the player to produce is), $"Key"_D$ is $D$'s input-key alphabet,
  $kappa_D : "Token"_D -> "Key"_D$ is $D$'s key-mapping, and $A_D subset.eq
  "Token"_D$ is a finite, enumerable subset used by completion-style pools
  ("master every element of $A_D$ once"). The present engine hard-wires
  exactly one domain, $D = "Korean"$, with $"Token"_"Korean" = "Jamo"$,
  $"Key"_"Korean" = "Key"$, $kappa_"Korean" = kappa$ (Def. 1.2), and $A_"Korean"$
  the 40-entry set enumerated in `create_game_mode`'s `"completion"` arm.
]

#proposition("11.1", name: "The content pool is a closed commitment Proposition 2.1 did not count")[
  `hangul_to_qwerty` and `create_game_mode`'s 40-entry list satisfy Definition
  2.1's closure criterion exactly as the four rows of §2.1's table do: their
  type signatures (`fn(&str) -> String` over a fixed `match`; a hard-coded
  `Vec<String>` literal) admit no second domain without a change to their own
  source, independent of §3--§8's generalization. Unlike the other four rows,
  this one is not implicated by \#705's stated symptom (single-jamo vs. word),
  which is why it was left out of Definition 2.1's table --- it is a
  *second, independent* axis of overfitting, orthogonal to answer length.
]

#proof[
  By inspection: neither function's signature mentions `Stimulus`, `Answer`,
  `Challenge`, or any type introduced by §3--§8. Generalizing every one of
  those types to admit multi-token words (as §3--§8 do) leaves both functions
  unchanged and still closed over exactly the same 40 Korean entries;
  therefore the content-domain closure is not discharged by, and does not
  discharge, the answer-length closure P.2--P.4 already fixed. The two are
  independent commitments that happen to share one crate.
]

#theorem("11.1", name: "Content-domain genericity requires no change to §3--§8")[
  Parametrizing the engine over an abstract content domain $D$ (Definition
  11.1) in place of the hard-coded `Korean` instance requires changing only
  `hangul_to_qwerty` and `create_game_mode`'s content-source functions into
  trait methods on $D$; every type and theorem of §3--§8 (`Stimulus`,
  `Answer`, `Challenge`, the token-cursor matcher, `GameMode`, the difficulty
  model) already quantifies over "whatever key-token sequence a challenge
  carries" and never inspects which domain produced it.
]

#proof[
  By re-reading each definition in §3--§8: Definition 3.1's `Glyph(String)`
  variant holds a display string, not a `Jamo` specifically; Definition
  4.1's answer sequence is over $"Key"$, not $"Key"_"Korean"$ by name;
  Definition 4.3's matcher compares buffer contents to $t(C)$ structurally,
  never against a Korean-specific table; and Theorem 7.2's per-token budget
  is a function of $n = |w|$ alone. None of §3--§8's proofs cite `Jamo`,
  `Key`, or $kappa$ except through Definition 1.1--1.2's now-generalizable
  aliases. Substituting $D$ for the fixed `Korean` instance throughout
  changes no proof's hypotheses.
]

#remark("11.1", name: "On renaming the crate")[
  Theorem 11.1 makes content-domain genericity a small, type-level change;
  it does not, by itself, argue for renaming `hangul-game-core`. A rename
  touches `Cargo.toml`, `package.json`, every import in
  `packages/ui/honeycomb`, and `apps/www`'s bundling, for a benefit that is
  purely nominal until a second domain is actually wired in. The judgment
  recorded here is to *keep the crate's name* until a second, real content
  domain exists as a concrete implementation of Definition 11.1 --- at that
  point the rename is a one-line decision with an obvious new name, rather
  than a guess made now about what a not-yet-written domain should be called.
]

== The `leetype_wasm` comparison and the API-authority axiom

`crates/leetype_wasm` is a second, independently authored WASM game crate in
this repository, testing typed source code against a target string rather
than Hangul against a QWERTY buffer. It is relevant here for two reasons: it
already follows, unprompted, the same private-core/thin-wrapper discipline
this canon has assumed throughout, and it shares just enough algorithmic
surface with `hangul-game-core` to make "should these share a crate"
a fair question to ask --- and, on inspection, to answer.

#axiom("11.1", name: "API authority")[
  In any crate governed by this canon, all business logic --- state,
  matching, scoring, difficulty --- is pure Rust, contained in a module the
  wasm-bindgen boundary does not itself define, and is `pub(crate)` or
  private beyond that module's own public Rust API. Exactly one thin
  `#[wasm_bindgen]`-annotated type per crate (`HangulGameCore`'s wrapper in
  `hangul-game-core`, `TypingGame` in `leetype_wasm`) is permitted to depend
  on `wasm_bindgen`/`serde_wasm_bindgen` at all, and its methods do no more
  than translate arguments in, delegate to the pure core, and translate
  results out.
]

#proposition("11.2", name: "Axiom 11.1 is independently attested, not invented for this canon")[
  `leetype_wasm/src/lib.rs`'s `TypingGame` wraps a private `TypingGameCore`
  (`src/game_core.rs`) exactly as `hangul-game-core/src/lib.rs`'s
  `HangulGameCore` wraps `internal::GameEngine`: every `#[wasm_bindgen]`
  method is a one-line delegation plus a `serde_wasm_bindgen` conversion, and
  `TypingGameCore`'s own methods (`handle_input`, `get_stats`, ...) reference
  neither `wasm_bindgen` nor `JsValue`. Two crates, authored for unrelated
  games, converged on the same boundary discipline without either being
  derived from the other. This is the same species of evidence the
  extensions canon cites Kubernetes' reconciliation loop and DarkReader's
  apply-first ordering as: independently-arrived-at convergence toward the
  same architecture is stronger evidence for an axiom than a single
  hand-designed instance of it.
]

#remark("11.2")[
  Axiom 11.1 is therefore not a new constraint this canon imposes on
  `hangul-game-core`; it names a discipline the crate (and its sibling)
  already follow, so that every story generalizing §3--§11's types can be
  held to it explicitly rather than trusting that the existing shape survives
  refactoring by habit alone.
]

== Why the shared surface does not yet warrant a shared crate

#proposition("11.3", name: "The shared surface is a problem statement, not a shared algorithm")[
  `leetype_wasm`'s `validation::calculate_consecutive_errors`/`validate_input`
  (`src/leetype/validation.rs`) and `hangul-game-core`'s token-cursor matcher
  (Definition 4.3) both answer "does typed input still match a target," but
  are not instances of one algorithm: `leetype`'s validator compares one
  linear sequence of canonical units against one fixed target, supports
  backspace as first-class (`handle_backspace`), and defines "consecutive
  errors" as the suffix from the first divergence to the end of a single
  answer; `hangul-game-core`'s matcher resolves one shared keystroke buffer
  against the *current token of every simultaneously active challenge*, has
  no backspace concept, and its entire exact/prefix/ambiguous trichotomy
  (Definition 4.3) exists only because several distinct targets can be live
  at once and share a textual prefix --- a situation `leetype`'s single-target
  model cannot express and does not need to.
]

#proof[
  Exhibited by direct comparison of the two functions' signatures and
  invariants: `validate_input` takes one `target_units: &[CanonicalUnit]`;
  `process_input` (`hangul-game-core/src/internal/engine.rs`) ranges over
  `self.active_reveals`, plural, and its `potential_extensions` check has no
  counterpart in `leetype_wasm` at all, because it is asking a question
  (`is there another active target this buffer could still be building
  toward?`) that only arises when more than one target can be live
  simultaneously.
]

#corollary("11.3.1", name: "Extraction now would force one of two bad shapes")[
  A shared crate today would have to be either (a) a single-target,
  no-ambiguity validator generalized just enough to be named after both
  crates while `hangul-game-core` continues to need its own multi-target
  matcher on top of it --- buying a shared name, not shared logic --- or (b) a
  genuinely unified abstraction covering both single- and multi-target
  matching, invented from exactly two data points and with no third instance
  to check it against. Either is the "wrong abstraction" the extensions
  canon's own minimal-sufficient-state-space objective (front matter, "What
  kind of object this is") warns against paying for before it is forced.
]

#proposition("11.4", name: "The crate-boundary judgment")[
  Pure game logic stays private within each wasm crate (`hangul-game-core`'s
  `src/internal/`, `leetype_wasm`'s `src/{game_core,leetype}.rs`), governed
  by Axiom 11.1, rather than being extracted into a shared library crate at
  this time. This is not a default arrived at by inertia; it is the outcome
  of Proposition 11.3 finding no reusable algorithm beneath the shared
  problem statement, and Corollary 11.3.1 finding no way to force one without
  either producing a hollow abstraction or generalizing from too small a
  sample.
]

#remark("11.3", name: "The falsifiable trigger for revisiting this")[
  This judgment is not permanent, and Proposition 11.4 is falsified --- not
  merely reconsidered --- the moment either of two concrete conditions is
  observed: (i) a *third* content-typing crate is added to this workspace
  and its matching requirements turn out to coincide, at the algorithm level
  (not just the problem-statement level), with one already implemented here,
  or (ii) `hangul-game-core` and `leetype_wasm`'s own matchers are found to
  need the same change made twice --- e.g. `leetype_wasm` growing a notion of
  simultaneously-live targets, or `hangul-game-core` growing a backspace/undo
  concept --- at which point the duplicated change *is* the reusable
  algorithm Proposition 11.3 did not yet find. Until one of these is
  observed, extracting a shared crate is optimizing for a reuse event that
  has not happened, at the cost of a new workspace member, a new versioning
  surface, and a new place Axiom 11.1 must be independently upheld.
]

#pagebreak()

// ═══════════════════════════════════════════════════════════════════════════
= Mutation Isolation and the Purity Boundary
// ═══════════════════════════════════════════════════════════════════════════

§3--§11 fix _what_ the engine's types and invariants are; none of them says
anything about _how_ a function signature should express changing one. An
audit run against \#748 found the mutable-borrow style --- `&mut self`,
`&mut T` threaded through multiple private call boundaries --- is the
crate's default, not an isolated exception reserved for genuine state
transitions. This section states the missing constraint as an axiom,
exhibits the audit's violations as the forcing evidence, and names the
exemplars already in-crate that satisfy it without having been written
against it explicitly.

#axiom("12.1", name: "Mutation isolation")[
  A function or method takes `T`/`&T` by default. `mut T`/`&mut T` is
  permitted only where a genuine state transition occurs, confined to the
  smallest possible scope: the mutation happens at one explicit transition
  point per operation, and a `&mut` reference is never re-threaded across
  more than one private-helper call boundary. Where a value is a state
  machine (as `GameEngine` is), its top-level public methods
  (`process_input`, `tick`, `spawn_character`, `start_timer`, `reset`,
  `set_mode`) are the transition points; every private helper they call
  computes and *returns* a value instead of mutating one handed to it.
]

#remark("12.1", name: "Orthogonal to Axiom 11.1")[
  Axiom 11.1 (§11.2) governs the crate/wasm-boundary _shape_: one thin
  `#[wasm_bindgen]` wrapper per crate, pure core behind it. It says nothing
  about mutation discipline _inside_ that pure core --- a crate can satisfy
  Axiom 11.1 to the letter (all logic private, one wrapper) while still
  threading `&mut` references through every private helper beneath that
  wrapper, which is exactly the state \#748's audit found. Axiom 12.1 is a
  second, independent constraint on the same pure core, not a restatement
  of the first: neither Axiom 11.1 nor ADR 0001 mentions function-level
  mutability at all.
]

#proposition("12.1", name: "The mutable-borrow style is the default, not an isolated exception")[
  Two independent pieces of evidence show Axiom 12.1 is violated by
  default rather than in one isolated spot: (a) `GameEngine::process_input`
  builds a local `let mut batch = EventBatch::new()` and threads `&mut
  batch` --- a second, independently mutable reference alongside the
  `&mut self` call chain --- through `advance_or_complete`, into
  `handle_match`/`handle_miss`, into `adjust_difficulty_faster`/
  `adjust_difficulty_slower`: four levels of `&mut self` and three levels
  of `&mut EventBatch` fan out from a single keypress. (b) `GameMode`'s
  trait contract requires `&mut self` on `get_next_challenge` and
  `on_miss`, but no implementation --- `CompletionMode`, `EndlessMode`, or
  `VocabularyMode` --- mutates `self` in either method; `EndlessMode` is a
  zero-field unit struct, so _every one_ of its `&mut self` methods is
  structurally a no-op, which is itself proof the trait over-requires
  mutation for a degenerate implementation.
]

#proof[
  By inspection of `internal/engine.rs`'s `process_input`/
  `advance_or_complete`/`handle_match`/`handle_miss`/
  `adjust_difficulty_faster`/`adjust_difficulty_slower` call chain, and of
  `internal/game_modes.rs`'s trait definition against
  `game_modes/{completion,endless,vocabulary}.rs`'s three implementations.
]

#proposition("12.2", name: "The exemplars already in-crate")[
  `internal/difficulty.rs` is fully pure --- zero `&mut` anywhere in the
  file --- and `internal/events.rs::flatten` builds a local, owned
  `Vec<GameEvent>`, mutates only what it locally owns, and returns it,
  touching no field of any type it did not construct itself. Both predate
  \#748 and already satisfy Axiom 12.1; `flatten` in particular is the
  pattern `process_input`'s call chain should imitate, not a new one
  invented for this section.
]

#remark("12.2", name: "What this section does not require")[
  Axiom 12.1 does not forbid `&mut self` outright, and does not ask
  `GameEngine`'s genuinely stateful top-level methods --- `start_timer`,
  `spawn_character`, `reset`, or `tick`'s own `active_reveals` retention ---
  to become pure. It asks that mutation stop being _re-threaded_: a
  private helper below one of those top-level methods should compute and
  return a value the caller assigns, rather than receiving a second live
  `&mut` reference of its own.
]

#remark("12.3", name: "set_mode as a concrete grounding instance")[
  A host-layer defect (mode/word_pool were readable only through
  `GameEngine::new`, so switching game modes at runtime forced a full
  reconstruction of the WASM object rather than a state transition on the
  existing one) is itself evidence for Axiom 12.1's own framing: mode is
  session lifecycle state a player can legitimately change mid-page-session,
  not fixed construction-time configuration the way `config` is. `set_mode`
  (ADR 0004 §2(f)) is exactly the shape the axiom predicts such a case
  should take --- a new named top-level transition point, sharing its
  session-clearing with `reset` through one private helper
  (`clear_session_state`) rather than duplicating it.
]

#pagebreak()

// ═══════════════════════════════════════════════════════════════════════════
= The Amendment Protocol
// ═══════════════════════════════════════════════════════════════════════════

== Sequencing against ADR 0001

This canon does not introduce a new story breakdown; it sequences its own
findings against ADR 0001's existing lettered decisions and epic \#420
stories, and adds exactly one prerequisite the ADR does not yet name:

+ *Fix the undischarged content contract first (Prop. 2.2), independent of
  everything else.* `EndlessMode` returning a genuinely random `Challenge`
  (Prop. 6.1) is a same-day, no-new-type-needed correction and should not
  wait on \#421--\#423.
+ *\#421 (Stimulus, §3) and \#422 (Answer sequence + matcher, §4) land
  together*, exactly as ADR 0001 already sequences them, because Theorem
  4.1's degenerate-case proof requires both the new `Challenge` shape and
  the generalized matcher to exist simultaneously to be checked against the
  existing single-jamo test suite (Corollary 4.1.1).
+ *The difficulty re-parametrization of §7 (Theorem 7.2, Corollary 7.2.1)
  lands in the same change as \#422*, not deferred to \#423. It is a
  prerequisite for \#423's `VocabularyMode`, not a follow-on: tuning
  per-stage difficulty against an unnormalized model (§7.1) produces
  constants that must be re-derived the moment the model is fixed.
+ *\#423 (`VocabularyMode`/`StagedCurriculumMode`, §6) follows*, correcting
  the completion/hint coupling (Remark 6.1) in the same pass, since a staged
  curriculum inherits that defect at every stage otherwise.
+ *§5's open cell-binding decision (Remark 5.1) must be recorded as an
  explicit amendment below before \#425 begins*, not discovered mid-
  implementation.
+ *\#424 (content/asset pipeline) proceeds in parallel*, as ADR 0001 already
  states, since it depends on none of the above.
+ *\#425 (stimulus-aware cells) and \#426 (word-answer input/progress UI)*
  follow \#421+\#424 and \#422+\#425 respectively, unchanged from ADR 0001's
  own sequencing.
+ *The content-domain genericity of §11 (Theorem 11.1) lands before or
  together with \#421*, not after. \#421 introduces `Stimulus`/`Answer` as
  concrete types; if it is implemented directly against `Jamo`/`hangul_to_qwerty`
  rather than against Definition 11.1's `ContentDomain` abstraction, it
  reproduces Proposition 11.1's fifth closed commitment inside the very
  types meant to fix the other four, and must be redone once a second
  domain is actually requested.

== Non-negotiables

- *No content contract crosses the `GameMode`/host boundary as a bare,
  uninterpreted string.* Proposition 2.2 is the standing counterexample for
  why this fails silently rather than loudly.
- *No difficulty constant is tuned per curriculum stage before Theorem 7.2's
  per-token normalization is in place.* A stage-specific constant tuned
  against the naive model (Definition 7.1) encodes an answer-length artifact
  as if it were a content-difficulty judgment, and will need to be re-tuned
  twice.
- *No new default value is declared independently in both Rust and
  TypeScript.* Corollary 9.1.1 generalizes Proposition 2.3's lesson forward.
- *Single-jamo play is a theorem (4.1), not a regression suite to keep
  green by discipline.* A change that requires editing the existing
  single-jamo tests to keep them passing has broken the degenerate-case
  proof and must be reviewed as such, not merged with "tests updated."
- *No content domain is hard-coded outside a `ContentDomain` implementation
  (Def. 11.1).* A new `match` arm added directly to `hangul_to_qwerty`, or a
  literal appended to `create_game_mode`'s alphabet, for anything other than
  Korean jamo reintroduces Proposition 11.1's fifth closed commitment in the
  same place it was just closed.
- *No pure game logic is extracted into a shared cross-crate library without
  meeting Remark 11.3's trigger.* Proposition 11.4's judgment is the default;
  departing from it requires exhibiting condition (i) or (ii) of Remark 11.3,
  not general tidiness or DRY sentiment.
- *No `&mut T`/`&mut self` parameter is added under `internal/` without
  exhibiting a genuine, isolated state transition (Axiom 12.1).* A private
  helper that only needs to read state, or that returns a value the caller
  assigns, must not be given a live mutable reference merely because the
  function that calls it already has one.

== Versioning

*v1.0* (2026-07-18). Initial filing, in response to \#705. Diagnoses four
independent closed commitments (§2.1) responsible for the "overfit to level
1" symptom; exhibits two live production defects as forcing evidence for the
diagnosis (Prop. 2.2's unconsumed `"random"` sentinel, Prop. 2.3's divergent
Rust/TypeScript defaults); derives the `Stimulus`/`Answer`/`Challenge`
generalization already decided in ADR 0001 §2 from first principles (P.1--P.4)
rather than restating it as given; proves single-jamo matching is the exact
$n=1$ case of a generalized token-cursor matcher (Theorem 4.1); and supplies
the difficulty per-token normalization (Theorem 7.2) that ADR 0001 leaves as
an implicit prerequisite of its own \#423.

*v1.0 → v1.1* (2026-07-19). A *major* amendment: it adds §11, "Content-Domain
Genericity and the Crate-Boundary Question," in response to two requirements
named directly rather than derived from \#705's text --- that the engine must
not assume its content domain stays Korean, and that pure/wasm-boundary
separation (already followed in practice) be stated as an explicit, checkable
axiom. New content: the `ContentDomain` abstraction (Definition 11.1) and the
proof that it is a fifth, independent closed commitment (Proposition 11.1,
orthogonal to the answer-length axis of §2); the theorem that §3--§8 already
generalize over it for free (Theorem 11.1) and the accompanying judgment to
defer any crate rename until a second domain is concretely wired (Remark
11.1); the API-authority axiom (Axiom 11.1), attested by the independently-
authored `leetype_wasm` crate following the identical private-core/thin-
wrapper discipline (Proposition 11.2); and the crate-boundary judgment
itself (Propositions 11.3--11.4) --- a direct comparison of
`leetype_wasm`'s single-target validator against `hangul-game-core`'s
multi-target token-cursor matcher showing the shared surface is a problem
statement, not a reusable algorithm, so no shared crate is extracted at this
time, with a falsifiable trigger (Remark 11.3) for revisiting the decision.
No axiom or theorem in §1--§10 was weakened; §11's theorem is proved from the
existing type definitions of §3--§8 without amending any of them. The
Amendment Protocol's sequencing and non-negotiables were extended
accordingly, and the Grounding table, Notation Index, and References gained
the corresponding rows.

*v1.1 → v1.2* (2026-07-22). A *minor* amendment: it adds §12, "Mutation
Isolation and the Purity Boundary," in response to \#748's audit of every
`&mut`/`mut` signature under `src/internal/`, which found the mutable-borrow
style is the crate's default rather than an isolated exception. New content:
the mutation-isolation axiom itself (Axiom 12.1); its explicit orthogonality
to the API-authority axiom of §11.2 (Remark 12.1) --- one governs
crate/wasm-boundary shape, the other governs mutation discipline inside the
pure core the first axiom already requires; the audit's two forcing examples
as a proposition (Prop. 12.1: `process_input`'s four-level `&mut self`/
three-level `&mut EventBatch` fan-out, and `GameMode`'s over-required `&mut
self` on `EndlessMode`'s zero-field unit struct); and the exemplars already
in-crate that satisfy the axiom without having been written against it
(Prop. 12.2: `internal/difficulty.rs`, `internal/events.rs::flatten`). No
axiom, theorem, or proposition in §1--§11 was weakened or amended; §12 is
additive. The Non-negotiables list gained one corresponding entry.

*v1.2 → v1.3* (2026-07-23). A *corrective* amendment, the first to reverse
rather than extend a prior remark: Remark 6.2 overturns Remark 6.1's own
resolution. \#423's implementation of Remark 6.1 removed the
`!show_romanization` gate from `CompletionMode::on_match` entirely, on the
theory that mastery must depend only on the matched challenge itself, never
on a global streak built across others. Direct product feedback identified
this as backwards: the gate is a required invariant (a match made while the
QWERTY hint is visibly on screen is not evidence of recall, however fast or
however unrelated the streak that hid or showed the hint), not the
accidental coupling Remark 6.1 took it for. The gate is restored in
`CompletionMode` and newly added to `VocabularyMode` (both variants) and
`EndlessMode`, which never had it. This is the first amendment to weaken a
prior remark's conclusion rather than add beside it; it is recorded as a
distinct remark (6.2) rather than a silent edit to 6.1, per this canon's own
discipline of citation anchors surviving revision (see the note on manual
numbering, above).

#pagebreak()

// ═══════════════════════════════════════════════════════════════════════════
#heading(level: 1, numbering: none)[Appendix --- Notation Index]
// ═══════════════════════════════════════════════════════════════════════════

#table(
  columns: (auto, auto),
  stroke: 0.4pt,
  [*Symbol*], [*Meaning*],
  [$"Jamo"$, $"Key"$, $"Cell"$, $"Mode"$], [Present closed universes (Def. 1.1)],
  [$kappa : "Jamo" -> "Key"$], [`hangul_to_qwerty`, the present answer map (Def. 1.2)],
  [$"Stimulus"$], [Sum type: `Glyph`/`Image`/`Icon`/`Speech` (Def. 3.1)],
  [$w = (w_0, ..., w_(n-1))$], [Answer sequence over $"Key"$ (Def. 4.1)],
  [$C = ("stimulus", w, c, ...)$], [Active challenge, generalizing `ActiveReveal` (Def. 4.2)],
  [$c$], [Cursor: tokens of $w$ already matched (Def. 4.2)],
  [$t(C) = w_c$], [Current expected token for challenge $C$ (Def. 4.3)],
  [$ell$], [Per-token difficulty budget, $= "current_lifetime_ms"$ reinterpreted (Def. 7.1, Thm. 7.2)],
  [$n = |w|$], [Answer length in tokens],
  [$D = ("Token"_D, "Key"_D, kappa_D, A_D)$], [Content domain: token type, key alphabet, key-map, canonical finite alphabet (Def. 11.1)],
  [$"Korean"$], [The present, sole `ContentDomain` implementation: $"Token"_"Korean" = "Jamo"$, $kappa_"Korean" = kappa$ (Def. 11.1)],
)

// ═══════════════════════════════════════════════════════════════════════════
#heading(level: 1, numbering: none)[References]
// ═══════════════════════════════════════════════════════════════════════════

- ADR 0001, "Multimodal word testing: a Stimulus/Answer domain model for the
  Hangul game," `crates/hangul-game-core/docs/adr/0001-multimodal-word-testing.md`
  --- the design decision this canon derives and extends.
- ADR 0004, "Mutation isolation," `crates/hangul-game-core/docs/adr/0004-mutation-isolation.md`
  --- ratifies §12's axiom; filed against epic \#748.
- `paulgsc/some-ui`\#705, "current wasm is overfit for level 1" --- the issue
  this canon is filed against.
- `paulgsc/some-ui`\#748, "Isolate mutation in hangul-game-core" --- the epic
  whose audit findings §12 formalizes.
- Engine source: `crates/hangul-game-core/src/internal/{engine,types,events,spawning,game_modes,difficulty}.rs`,
  `src/internal/game_modes/{completion,endless}.rs`, `src/lib.rs`.
- Host source: `packages/ui/honeycomb/src/{lib/hangul,hooks,components/hangul-hex-grid,types,utils}`.
- `crates/leetype_wasm/src/{lib,game_core,leetype,leetype/{canonical,state,stats,validation}}.rs`
  --- the independently-authored sibling crate compared against in §11 for
  the API-authority axiom and the crate-boundary judgment.
- Extensions canon, "The Unsettled Surface," `docs/canon/dom-state-estimation-canon.typ`
  --- the format, minimal-sufficient-state-space objective, and Amendment
  Protocol discipline this document deliberately mirrors.
