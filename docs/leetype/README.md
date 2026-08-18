# LeetType: a competency probe whose input modality happens to be typing

This is the decision record for the user-story shift tracked in
[#851](https://github.com/paulgsc/some-ui/issues/851) and decomposed across
milestone **leetype (M20)**. The epics carry the work; this file carries the
vocabulary and the five decisions the work assumes, because those outlive
the issues that close.

It is deliberately not a spec. If a detail is only interesting while one
story is being implemented, it belongs in that story.

## The shift

**Before.** Pick a problem from a grid, configure a session (language,
duration, N), type a source file 1:1, race a clock, earn XP.

**After.** A serial sequence of _forcing question → smallest proof_ steps.
The player reads one sentence, types, and repeats. Everything else —
difficulty estimation, hint timing, whether they may move on — is inferred
from how they type.

The slogan that keeps the design honest:

> The game is not a typing game over source code. It is a competency probe
> whose only input modality happens to be typing.

Two consequences that are easy to lose:

- **The source is evidence, not the subject.** A module from `pnpm` is not
  being taught. The competencies required to have written it are. After
  extraction the provenance is nearly irrelevant.
- **1:1 fidelity to a source is not a goal.** A step's body is the smallest
  code that demonstrates one competency. If a step takes a minute to type,
  it is two steps.

## Vocabulary

Two coordinate systems, already in the engine, unchanged by any of this:

- **display index** — an index into the _rendered_ source, indentation and
  newlines included.
- **slot** — an index into the _typeable stream_: the subsequence the player
  actually presses a key for. Layout whitespace has a display index and no
  slot. This is what lets the caret fly over indentation while sitting on a
  real character. See `crates/leetype_wasm/src/leetype/program.rs`.
- **context** — a third role alongside typeable and skip (LTY-FRAME, #991):
  source that renders as code, anchors the typeable slots around it to a
  position, and — like skip — has a display index and no slot. Unlike skip,
  it is not layout; it is content the player reads but is never asked to
  produce. Carrying no slot is the load-bearing fact: it keeps a frame out
  of every figure the reveal gate reads without a special case anywhere
  that reads them.

New with the shift:

- **step** — the atom of an exercise: _n_ prompt-ish blocks plus **exactly
  one** typing block.
- **exercise** — an ordered sequence of steps.
- **block** — `PromptBlock | TypingBlock`. Future kinds (hint, feedback,
  compiler output) are prompt-side; the typing path never grows a case.
- **reveal window `k`** — how many tokens ahead of the caret are unmasked.
  A step starts fully masked; after an initial delay `t`, `k` opens, then
  tracks the player.
- **absolute WPM** — instantaneous, windowed over recent keystrokes.
  Volatile by design; drives `k`.
- **weighted WPM** — slower, discounted by assistance taken and accuracy;
  gates progression to the next step.
- **baseline** — the player's own typing speed, sampled in an agnostic
  warm-up. Every threshold is a function of it.
- **hunk** — a `TypingBlock`'s optional `patch` overlay: one line kind
  (`context` / `del` / `add`) per rendered line. It reduces — every line is
  still exactly `context` or `typeable` to the engine either way (LTY-PATCH,
  below); a hunk is authored data about which lines the _renderer_ paints as
  removed or added, not a new engine concept.
- **deletion** — a `del` line: ordinary `context` (rendered, read, never
  typed, carries no slot), additionally marked as the code being removed, so
  the renderer paints it as struck-through rather than merely given.
- **addition** — an `add` line: a rendered line containing at least one
  `typeable` character — the ordinary typing stream, given its own tint and
  the hunk's new-line-number column. A line that is `context` throughout is
  neither a deletion nor an addition; it is the hunk's unchanged middle.

## The five decisions

### 1. The prompt is outside the scroll model

A sticky prompt panel (~20% of the card) above a scrolling typing viewport
(~80%), one step per card, with a step rail beneath. Auto-scroll only ever
concerns the viewport, so "should scrolling centre on prompts" is a question
nobody has to answer.

Notebook and conversation layouts were rejected: both put the prompt inside
the scroll container, which is what makes caret-following hard and what
forces the renderer to learn what a prompt is.

`CodeDisplay`'s invariant survives untouched — _render a linear sequence of
display glyphs plus caret state_. No mode flags.

### 2. One typing block per step

The original sketch allowed arbitrary interleaving of prompts and typing
within one exercise view. That reintroduces the notebook problem: with two
typing blocks on one card, "which prompt is sticky" becomes live and the
panel needs a scroll-spy. So the cardinality is constrained and multi-part
work becomes a _sequence of steps_, not a taller card.

The cost, stated plainly: an exercise wanting two typing blocks under one
shared prompt repeats the prompt across two steps. Cheap, and the sticky
panel stays trivially correct.

### 3. Reveal is engine state, not a render prop

Masking used to be a `displayMode` prop with a one-way latch in front of it
(`wpm >= 40 → hidden`, set during render). Reveal is now derived from cursor
position, keystroke timing and baseline-derived thresholds — all engine
facts — so the engine projects per-slot visibility and the renderer draws
what it is handed, exactly as it already does for roles and slot status.

Consequence: the reveal loop is provable by `cargo test -p leetype_wasm`,
with no DOM in the picture.

The loop is negative feedback — masking slows the player, slowness opens
`k`, revealed text speeds them up, speed closes `k` — which self-seeks the
frontier of what they can retrieve unaided. Its hazard is oscillation at the
threshold, so the control law carries a deadband, and the invariant tests
exist to prove it.

### 4. No absolute WPM constant survives

`ADAPTIVE_WPM_THRESHOLD = 40` measured nothing about a 90-WPM typist. WPM is
being used as a proxy for _retrieval fluency_ — the gap between typing text
you must recall and text you are merely copying — and that gap is only
readable against a player's own copying speed. Thresholds are functions of
the sampled baseline, which is ephemeral (`localStorage`): clearing it costs
one warm-up.

### 5. Sink classification from typing behavior is deferred, on purpose

LTY-ROUTE (M20's finite sink graph and fallback) routes between obligations
on exactly two signals, both already engine-owned and already across the
boundary in `Snapshot`: `attempt` (which attempt at this obligation this is)
and `assisted` (correctly-resolved slots the player could see when they
resolved them). It does not attempt to classify _which_ sink a stuck learner
hit from typing behavior — no hesitation attribution, no pause-duration
inference, no reveal-pattern classifier.

This is a decision, not a shortfall. `adaptive-learning-canon.typ` Axiom 3.1:
evidence arrives confounded, and no single observation identifies a
competence. A pause on a witness is consistent with not knowing it, knowing
it but mistyping, keyboard unfamiliarity, reading the frame, or a phone
ringing — the same confound this document's own "gate's miss is a repeat"
note is built around, one level up. `attempt` and `assisted` say only _this
witness was not fluently produced_; inferring _why_ from the same channel
would be a claim the channel cannot support, and the repository's own rule
is that no judgment ships unless it can produce its own justification.

**What would lift the deferral:** a **Proposition 8.2** class III sensor —
an explicit, off-critical-path, confidence-weighted _observation_ channel,
never an inference from timing. "I don't know what `.swap` does," typed
between sessions, is that channel. A 900ms pause before typing it is not.
Until such a channel exists, sinks are authored graph structure (LTY-ROUTE
R1/R2's confusion-edge-plus-bridge), never a runtime inference — no type in
this workspace names an inferred sink.

## LTY-PATCH: the typing block becomes a hunk

Tracked in [#1075](https://github.com/paulgsc/some-ui/issues/1075). Before
this, a step's typing block was a fragment of source with a frame around
it. After it, a typing block can carry a `patch` overlay and read as a git
diff hunk: the `-` lines and the surrounding context are rendered and read
but never typed, and the `+` lines are the ordinary typeable stream. The
payoff is that a step can be authored by _taking a patch_ — a solve that
breaks, a commit that fixes a bug — instead of hand-composing a frame
around a blank.

**The claim worth recording is that the engine does not change at all.** A
`-` line and an unchanged ` ` context line are, to the engine, the same
thing, and that thing already shipped as LTY-FRAME's `Role::Context`
(`crates/leetype_wasm/src/leetype/program.rs:17-19`, the `Context` variant
at `:63-67`): source that renders as code, anchors the typeable slots
around it to a position, is never typed, is never masked, and carries no
slot at all. With no slot, there is nothing for `VISIBILITY_MASKED` to
apply to, nothing to enter `assisted` or `correct`, and therefore nothing
to move `weightedWpm` or `gateThreshold` (#998). The `+` lines are the
ordinary typeable stream and want nothing new. So the corpus already
contained diffs that had not been painted as diffs — `seed.ts`'s
`diagnosticLoopProgressStep` is a one-line hunk with three lines of
context, and `entryApi`'s three-step chain (`entry-03-place` through
`entry-05-mutate`) is an accumulating patch where each step re-shows every
prior commitment as context and adds one line.

This is a **cross-reference, not an edit**: the sentence above cites
`program.rs` by path and line rather than adding a comment to the crate,
because `crates/leetype_wasm` staying untouched is itself one of the
epic's "done when" claims, and leaving it literally true — checkable with
`git log -- crates/leetype_wasm` — is worth more than a pointer comment
one file over. If a future reader wants the note inside the crate itself,
that is a small, separate, deliberate change, not a default this record
took on the crate's behalf.

**What this forecloses**, recorded as decisions because each will be
proposed again by someone who has not read this section:

- **No fourth `Role`.** `Role::Deleted` would be `Role::Context` with
  different paint. The engine's question is _who owes a keystroke_, and on
  that question a deletion and an unchanged line are identical. A new
  variant would bump the wire encoding, `bindings-contract.ts`, every zod
  schema and every consumer of `roles()` to carry a distinction the engine
  never reads.
- **No diff parser in the crate.** `program.rs` is a pure function of a
  source string and knows no language by design. Teaching it unified-diff
  syntax is the same category of mistake one level up.
- **No `+`/`-` characters in `displaySource`.** They would take display
  indices, land in `roles`, and be handed to `Prism.tokenize` as if they
  were code. The sign column is a gutter, and gutters are not part of the
  character stream.
- **No second controller.** The reveal loop, error accounting, accuracy,
  WPM and progression stay engine state (decision 3 above). A patch step's
  textarea holds `value=""` and stays `readOnly`, same as every other step.

**The mapping the two step families read a hunk through**, once
`entryApi`'s chain (LTY-PATCH P5) demonstrates the construction side of it:

|             | diagnostic                                 | construction                                                     |
| ----------- | ------------------------------------------ | ---------------------------------------------------------------- |
| ` ` context | the frame around the fault                 | the surrounding code the obligation lives in                     |
| `-` deleted | the broken attempt — the falsified witness | the prior commitment, or the naive form the constraint rules out |
| `+` added   | the repair                                 | the witness that discharges the obligation                       |

Same mechanics on both rows, because the engine sees only context and
typeable. The families differ in what the author _means_ by a deletion —
exactly where they already differed on `rationale` versus `obligation`,
neither of which is rendered.

**A construction `-` line is not a blank with a hint over it.** Diagnostic
deletions are the thing that was falsified — showing them is the point.
Construction deletions are optional, and careless ones become an answer
key: a `-` line showing the naive form the player is steered away from can
give the `+` line away by contrast. The authoring test (#1006) applies
unchanged — _what conceptual claim becomes true because this exact
fragment is present?_ — and it is the test that catches a `-` row that
makes the `+` row guessable rather than genuinely ruled-out.

**The layered-DSA reading.** The working meta a person uses reading an
unfamiliar diff: given source of _N_ lines, reason about an _N choose K_
hunk that targets one concept or invariant. `entryApi`'s three steps are
that operation on a four-line fragment — pick the smallest slice that
discharges one obligation, hold the rest as context, repeat for the next
layer. Nothing about that is specific to a four-line toy; it generalizes to
constructing a real solution one algorithmic layer at a time against real
source. Stated as an authoring constraint: a construction step is never
"remember the method name" — a step that reduces to recalling an API name
is a bridge (LTY-ROUTE), not an obligation, and the hunk shape is more
inviting to that mistake than a frame was, not less, which is exactly why
it is worth naming here.

## Where the magic is quarantined

The full ambition is a compiler, not a prompt:

```
source → AST → concept extraction → evidence graph → difficulty estimation
       → minimal competency decomposition → construction/diagnostic classification
       → frame/evidence generation → typeable witnesses
```

Every arrow left of the last one is **deferred out of M20**. What ships is a
hand-authored TS shim behind a single function, which occupies the last
arrow only. That is not a shortcut around the interesting problem — it is
the sequencing: the mechanical half (shell, reveal loop, gate) has to be
playable before there is anything to judge the judgment against.

LTY-ROUTE adds one arrow to the left of the shim, without moving the
boundary: `obligation graph → linearized route → Exercise`
(`lib/leetype/exercises/obligation-graph.ts`). `requires` — the edge order
depends on — now has a consumer; the emitted `Exercise` still does not
change shape, and the graph stays private to that directory, unwired from
the seed corpus, exercised only by its own tests. Wiring it into
`nextExercise` is a decision for whoever authors the next problem, not a
consequence of the graph existing.

The rule the eventual pipeline inherits, and the reason the shim's _shape_
matters more than its contents:

> No judgment is allowed unless it can produce its own justification.

"This module demonstrates ownership" → show the spans. "This concept depends
on borrowing" → show the edge. "Reveal the next two tokens" → show the
latency that crossed the threshold. A decision that cannot explain itself is
a bug or an open research problem, not acceptable model behaviour.

The acceptance test for the real pipeline, when it lands, is therefore
narrow: _it emits what the shim emits._

## The epics

| Epic                                                             | What it settles                                                |
| ---------------------------------------------------------------- | -------------------------------------------------------------- |
| [#861](https://github.com/paulgsc/some-ui/issues/861) LTY-PRUNE  | The census of what the new story orphans, and its removal      |
| [#862](https://github.com/paulgsc/some-ui/issues/862) LTY-SHELL  | Decisions 1 and 2 — the prompt/typing composition              |
| [#863](https://github.com/paulgsc/some-ui/issues/863) LTY-REVEAL | Decisions 3 and 4 — the reveal loop, the two scalars, the gate |
| [#864](https://github.com/paulgsc/some-ui/issues/864) LTY-SHIM   | The exercise contract and the quarantine boundary above        |

## What the implementation settled that the decisions left open

Four questions the stories deliberately deferred to whoever wrote the code.
Recorded here because each is now load-bearing and none of them is guessable
from the design above.

**The reveal unit is a _run_.** Not a slot, not a lexical token. A run is a
maximal span of adjacent, non-whitespace slots, derivable from the existing
`Role` classification with no language knowledge at all. `k` counts runs.
Revealing "the next three slots" of `or_insert_with` would reveal `or_`,
which is noise; revealing by lexical token would make the engine learn the
language. See `crates/leetype_wasm/src/leetype/program.rs`'s `Run`.

**Instantaneous WPM spans to `now`, not to the last keystroke.** A fixed ring
of the last twelve keystrokes, measured from the oldest retained one to the
present moment — so the figure keeps falling _during_ a hesitation rather
than only once it ends. A measure that updates only on keystrokes cannot see
a player who has stopped typing, which is exactly the player the reveal
window exists for. The same fact forced `Command::Tick`: a controller driven
only by keystrokes freezes precisely when it most needs to open.

**The gate's miss is a repeat, capped at three attempts.** Falling short
brings the same step round again with a shorter initial delay; the third
attempt advances regardless. The cap is not a nicety — without it "the player
can always eventually reach the end" stops being true. The affordance is one
line on the step rail and nothing else: a dialog explaining that you were too
slow would break the loop's only rule.

**The corpus-fetch seam is gone, not re-typed.** `apps/www` no longer fetches
anything for this activity, and the `public/leetype` plumbing, the
code-samples tree and the Curriculum Decomposer prompt went with it (see
[`retired-curriculum-decomposer.md`](./retired-curriculum-decomposer.md)).
Keeping a fetch path against `Exercise` would mean two sources for one thing
and a second, unexercised copy of a validation the shim already performs. The
consequence worth knowing: the GitHub Pages build and the Docker build now
run the same code path for LeetType, with nothing mounted and nothing
fetched — the difference between them is gone rather than documented.

## Where the invariants actually live

```bash
cargo test -p leetype_wasm     # the reveal loop and the gate
pnpm --filter @some-ui/leetype test   # the contract, the shim, the shell
STORYBOOK_STATIC=… pnpm --filter www test:ui-fit   # the boxes
```

The first is the one that matters most, because it is the one that could not
have been written any other way: reveal is engine state, so oscillation,
runaway, traps, regression and reflow are all reachable without a DOM.
`tests/invariants.rs` states them as properties over a synthetic player
(`tests/support::Typist`), and includes a negative control that collapses the
deadband and asserts the flicker comes back — a hysteresis test that passes
without hysteresis is not a test.

## Why this is a `.md` and not a `.typ`

`docs/canon` is for claims that want citation-checked proof obligations.
Nothing here is metamathematics — it is an architecture decision plus a
vocabulary. The invariants this design _does_ owe (no oscillation, monotone
reveal, bounded convergence) are discharged as property tests in
`crates/leetype_wasm/tests/invariants.rs`, which is a stronger place for
them than prose.
