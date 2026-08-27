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
- **hunk** — a `TypingBlock`'s optional `diff` overlay: an ordered list of
  authored segments (`context` / `deletion` / `addition`, each carrying its
  own text), from which both the engine-facing `source` string and a
  per-rendered-line kind (`context` / `del` / `add`) are mechanically
  derived. It reduces — every line is still exactly `context` or `typeable`
  to the engine either way (LTY-PATCH, below); a hunk is authored data about
  which lines the _renderer_ paints as removed or added, not a new engine
  concept.
- **deletion** — a rendered `del` line, derived from a `deletion`-kind
  segment: ordinary `context` (rendered, read, never typed, carries no
  slot), additionally marked as the code being removed, so the renderer
  paints it as struck-through rather than merely given.
- **addition** — a rendered `add` line, derived from an `addition`-kind
  segment contributing at least one character to it — the ordinary typing
  stream, given its own tint and the hunk's new-line-number column. A line
  with no addition-segment characters on it is neither a deletion nor an
  addition; it is the hunk's unchanged middle.

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

**Amended by LTY-PATCH P3 (#1078):** untouched in the sense that actually
matters — _the renderer decides nothing_ — but no longer in the most
literal reading of "a linear sequence of glyphs." Handed a hunk overlay,
`CodeDisplay` now organizes those same glyphs into rows, each with a sign
column and old/new line-number columns. The line to draw, stated
explicitly because this is the first story entitled to move it: **layout**
is conceded, **policy** is not. `CodeDisplay` still owns no masking rule,
no error accounting, no threshold, no latch and no memory, and its props
still carry no exercise vocabulary — no `Step`, no `TypingBlock`, no mode
flag, only a per-line kind array derived from a step's `diff` overlay
(`docs/leetype/README.md`'s own "hunk"/"deletion"/"addition" vocabulary,
not this one's). That is the same line #1004 (E4) drew for the frame: the
frame needed nothing new because `Role::Context` already existed and
`CodeDisplay` could render it unchanged; a hunk's row structure genuinely
does not derive from anything already in `CodeDisplay`'s props, which is
what makes this the first requirement actually entitled to extend them,
rather than a mode flag arriving by default because a line was easy to add.

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
it. After it, a typing block can carry a `diff` overlay and read as a git
diff hunk: the `-` lines and the surrounding context are rendered and read
but never typed, and the `+` lines are the ordinary typeable stream. The
payoff is that a step can be authored by _taking a patch_ — a solve that
breaks, a commit that fixes a bug — instead of hand-composing a frame
around a blank.

A `diff` overlay is authored as an ordered list of segments — `{ kind:
"context" | "deletion" | "addition", text: string }` — rather than as a
hand-written `source` string plus a separately hand-written per-line kind
array. `typingBlockFromDiff` (`types/exercise.ts`) builds the whole
`TypingBlock` from segments alone: the engine-facing `source` and the
renderer's per-line kinds are both mechanically derived from the same
segments, so the two can no longer independently drift the way a
hand-authored `source` and a hand-authored line-kind array once could.

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
contained diffs that had not been painted as diffs — `seed/loop-progress.ts`'s
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

## LTY-WHY: the reason-reaffirmation shim

Tracked in [#1100](https://github.com/paulgsc/some-ui/issues/1100). After a
step's hunk is typed, an accordion can pose "why is this the right fix" as
2–5 authored candidate rationale sentences, leetyped rather than clicked: a
keystroke is valid as long as what is typed so far is a prefix of at least
one surviving candidate, the live set narrows as characters diverge
candidates out, and reaching the end of any one candidate exactly is
completion.

This decision record exists because the recon that produced this epic
nearly shipped the wrong default: the wireframe canvas built to check the
interaction drew a green checkmark and a "that's the one" verdict — a
completely reasonable-looking UI that is, on inspection, exactly the
failure mode this document's own rule exists to catch (_"no judgment is
allowed unless it can produce its own justification,"_ below). There is no
semantic verifier. A verdict rendered without one is a judgment with no
justification, dressed as a feature. The canvas has been corrected; this
section is what keeps the correction from being lost the next time someone
builds toward the wireframe instead of toward this doc.

**No mastery signal, unconditionally.** Not "conditional on it" —
confirmed, the same posture LTY-SEAM already holds for the whole exercise
(`p_credited = false`, #1015). This feature does not get its own exemption
or its own argument; it inherits the one that already exists. Nothing this
epic ships is read by `weightedWpm`, `gateThreshold`, `progression()`, or
any persisted store.

**This is a stub for an eventual system, named so it is not mistaken for
the final shape.** The eventual version has a real semantic verifier, gates
on specific vocabulary, and judges against a canonical rationale that stays
hidden even after the player answers — a hidden choice that can't be
unhidden. Recorded here the same way "Where the magic is quarantined" below
names its own deferred pipeline without building any of it: this is the
second thing in this doc held to that standard. The acceptance test for the
eventual verifier, when it lands, is the same shape as that section's own
rule — _it emits what the shim emits, plus a verdict the shim never had
grounds to render._

**Until the verifier exists: accept, don't grade.** Any candidate the
player types to completion is accepted — not "the authored-canonical one is
marked right and the rest wrong." Every authored candidate is equally valid
_for analysis_ in the absence of something that can actually analyze them.
No candidate is ever colored, labeled, or modal-announced as correct or
incorrect. At most a neutral acknowledgement ("noted") on completion.

**Not hoisted in wasm, and why that is not a compromise.**
`crates/leetype_wasm/src/leetype/session.rs`'s `press()` matches one
keystroke against one `expected` character read from one compiled
`Program` (`:249`) — there is no candidate-set notion anywhere in the
crate, and no small parameter change adds one. This epic does not pay that
cost: `crates/leetype_wasm` gets nothing from it, no new export, no new
`Program` variant, no wasm-bindgen surface. That is not a scoped-down
version of doing it properly; it is the same sequencing
`lib/leetype/exercises/index.ts` already uses for the exercise-generation
pipeline — the interesting, hard part (real semantic verification) is
deferred wholesale, and what ships is a small, honest, engine-free
placeholder for the one arrow it actually occupies: accept a well-formed
attempt.

**What this forecloses**, recorded as decisions because each will be
proposed again by someone who has not read this section:

- **No color-coded right/wrong on any candidate, ever, in this epic.** Not
  "hidden until an admin flag flips it" — genuinely absent from the
  component. The moment the code carries a notion of "the correct
  candidate," someone will render it, and rendering it is the thing being
  forbidden.
- **No modal.** The worked-route rule against dialogs on the graded loop
  (#1012) is written for the _graded_ loop and does not strictly bind an
  ungated widget — but the corrected behavior above makes the question moot
  anyway: there is nothing to pop a modal about when nothing is being
  judged.
- **No persistence of which candidate a player converged on**, absent a
  separate decision. LTY-SEAM S2's "persist nothing, score nothing"
  (#1016) applies by default; logging choices to eventually train or seed
  the verifier is a real future decision with its own privacy and canon
  argument, not something this epic reaches for by default.
- **No engine change.** Per the recon above, `press()`'s single-`expected`-
  character model has no small path to a candidate-set model, and this shim
  does not need one.

**Vocabulary**, added alongside the entries above:

- **candidate** — one authored rationale string in a step's
  `rationaleChoices`, accepted on exact completion, never colored, never
  ranked against the others by anything the runtime reads.
- **canonical** — authoring metadata on a candidate (LTY-WHY W2): which one
  an author believes is correct, worth recording for the eventual verifier,
  never load-bearing because nothing in this epic's runtime path reads it —
  same posture as `rationale`/`obligation` above.
- **narrow** — the shim's one piece of logic (LTY-WHY W3): a pure function
  that narrows a live candidate set against a typed-so-far prefix. It is the
  entire amount of judgment this epic performs, and the entire amount it is
  allowed to.

## LTY-MOBILE: below the breakpoint, the modality changes and the subject does not

Before this, LeetType had one surface. Below about 768px that surface was
still rendered, still masked text, still measured WPM, and still gated on a
baseline — on a device with no keyboard to produce code with. It looked
playable and reported numbers that meant nothing, which is worse than not
offering it.

After it, `Leetype` is a chooser. A wide viewport gets `TypingSession` —
byte-for-byte the surface M20 shipped, moved from
`components/typing-game/leetype` to `components/typing-game/typing-session`
and renamed, with no behavioural change. A narrow one gets `ReadingSession`
(`components/reading-game/`): the same corpus, the same runner, the same
seeded schedule, and a different probe.

The slogan this whole document opens with is what licenses it:

> The game is not a typing game over source code. It is a competency probe
> whose only input modality happens to be typing.

Taken seriously, that sentence says the typing is incidental. This epic is
the first thing to actually take it seriously: on a phone the modality is
unavailable, so it is the **modality** that changes and not the subject.

### The two probes, named

- **Production** (desktop). The player produces the witness by typing it under
  the reveal loop. Fluency against their own sampled baseline is the evidence.
- **Discrimination** (mobile). The player reads the hunk and picks the claim
  the change makes out of a set of claims the corpus makes about _other_
  changes. Recognition is the evidence.

Discrimination is a **strictly weaker signal**, and nothing about the
implementation pretends otherwise. The mobile surface produces no baseline
sample, no absolute or weighted WPM, no gate, no reveal window and no attempt
counter — every one of those is a fact about production read out of keystroke
timing, and there are no keystrokes. Nothing it produces is read by
`weightedWpm`, `gateThreshold`, `progression()`, `baseline-store`, or any
persisted store: LTY-SEAM S2's _persist nothing, score nothing_ (#1016) and
`p_credited = false` (#1015) apply by inheritance, not by a new argument.

`adaptive-learning-canon.typ` **Axiom 3.1** is the reason this is honest
rather than a shortfall: evidence arrives confounded, and no single
observation identifies a competence. A correct pick is consistent with
recognition, with elimination, and with a lucky guess out of four. Recording
it as mastery would be a claim the channel cannot support — the same
confound this document's own deferral of sink classification is built around,
one modality over.

### Why a component branch and not a media query

Because `useTypingGame` lives inside `TypingSession`, and a hook cannot be
called conditionally. Branching at the component boundary is therefore what
makes the strongest claim available: **a phone never fetches
`@some-ui/leetype-wasm` at all.** `components/leetype/index.test.tsx` pins it,
with a negative control that asserts the wide branch _does_ load the engine —
an "it didn't load wasm" test that passes when nothing loads wasm is not a
test.

The consequence worth stating: every engine invariant proved by
`cargo test -p leetype_wasm` remains a statement about a system the mobile
surface cannot perturb, because it never instantiates one.

The breakpoint is `useIsMobile`'s 768px, from `some-ui-utils`, reused rather
than re-picked. The workspace already has exactly one answer to "is this a
phone"; a second constant here would be a second answer, and the two would
drift.

### Where the question and the answers come from

Not from a new authored field. `readingProbeOf`
(`lib/leetype/reading-probe`) derives a card from data the corpus already
carries:

| step family  | the claim         | the question                          | the reason                         |
| ------------ | ----------------- | ------------------------------------- | ---------------------------------- |
| diagnostic   | `rationale.cause` | _What fault does this change repair?_ | `rationale.whyRepairDiscriminates` |
| construction | `obligation`      | _What does this change establish?_    | — (none authored yet)              |
| neither      | `goal`            | _What is this change for?_            | —                                  |

`goal` is required by the schema, which makes `claimOf` **total**: no
schema-valid step can fail to produce a card. That matters more here than it
would on the desktop path, because the reading surface is the _only_ surface
on a phone — a step it could not pose would be a dead end, not a degraded
card.

**Distractors are other steps' own claims**, preferring one that shares a
`concepts` entry with the step being posed, ordered by the session seed. Not
authored per-step distractor lists, which would have left the surface
unreachable on every existing step until somebody wrote three plausible wrong
answers for each, and which age into strawmen the moment the author's
attention moves on. A claim drawn from the corpus is a sentence somebody
meant, about a change somebody made. The concept preference is what makes a
distractor a near miss rather than a category error, and a probe you can pass
without reading the code probes nothing.

The judgement performed is small enough to state in full, which is the bar
this package holds itself to: _a distractor is another step's authored claim,
preferring one that shares a concept, ordered by seed._ That is the entire
amount of judgement this epic performs and the entire amount it is allowed
to — the same posture LTY-WHY's `narrow` holds.

### The amendment: `rationale` and `obligation` are rendered here

This document records both as authoring metadata **never rendered to the
learner**, and `ExerciseSchema`'s own comments say so again. On the production
path that is exactly right: an obligation shown above a blank is the
description card this whole shift retired, handing the player the answer to
the thing they were about to type.

The reading path inverts the situation. Here the claim **is** the answer, and
it is offered inside a closed set alongside claims the corpus makes about
other changes; discriminating it is the entire task. An answer key among
distractors is the format, not a leak.

So the rule is amended rather than waived, and the amended form is:

> `rationale` and `obligation` are never rendered on the production path, and
> on the reading path only as one option among others — never alone, and never
> before a choice has been made.

`ClaimChoices` is the one component entitled to draw a claim, and it is handed
`answerId: null` until the player has answered, so there is no render in which
it holds the answer and merely declines to paint it.

### The other amendment: a verdict, with its justification attached

LTY-WHY forbids a verdict on its typed-rationale shim, and correctly: there is
no semantic verifier, so _"that's the one"_ would be a judgement with nothing
under it. That rule is this repository's own —

> No judgment is allowed unless it can produce its own justification.

— and a closed choice set satisfies it **literally**, not by exemption. The
judgement is exact identity with the step's own authored claim; no verifier is
required to compute it. The justification is the author's own
`whyRepairDiscriminates`, rendered right underneath.

The paint is held to the same restraint LTY-WHY argued for anyway. The verdict
lives on the option rows, as a glyph plus a word, next to the option the
player actually chose. `ReadingFeedback` carries no verdict at all — a `WHY`
eyebrow and the sentence, in neutral paint. "Correct" on its own teaches
nothing, and a learner who guessed right learns exactly as much as one who
reasoned.

**A cost, left visible.** Construction steps have no authored equivalent of
`whyRepairDiscriminates`, so their cards end at the marked rows and the
explanation panel does not mount. That is a real thinness across half the
corpus. It is deliberately not papered over with generated prose or with the
claim restated in different words: the fix is an authored sentence for the
construction family, which is a corpus change argued on its own merits.

### What this forecloses

Recorded as decisions because each will be proposed again by someone who has
not read this section.

- **No side-by-side diff on any width, and no split/unified toggle.**
  `DiffCard` is unified, permanently. This is a product decision, not a
  simplification pending a bigger screen.
- **No wrapping in the code region, ever.** Wrapping destroys indentation,
  disconnects a continuation line from its sign, and makes an `add` row
  impossible to align against the `del` row above it — which is the entire
  comparison the card exists to support. The code region scrolls horizontally;
  the page does not.
- **No engine on the mobile path.** Not "lazily", not "only if the exercise
  needs it". `ReadingSession` importing anything wasm-shaped is the regression
  the chooser's test exists to catch.
- **No mastery signal, no persistence, no streak, no XP.** M20 removed XP and
  levels outright, and a new surface is exactly where they get proposed again.
- **No `surface` prop set by a host.** `apps/www` passes none, and should not:
  a host choosing which probe a device gets would be an application holding an
  opinion about a package's internals, and the registry contract (_render with
  no props_) is what that would break. The prop exists for stories, tests and
  deep links.
- **No second corpus and no mobile-only exercises.** One `Exercise` type, one
  shim, one schedule. If a step reads badly on a phone, that is a fact about
  the step.
- **No `Role`, schema or crate change.** `crates/leetype_wasm` is untouched;
  `types/exercise.ts` gains nothing. The whole epic is a derivation
  (`lib/leetype/reading-probe`) plus a set of renderers, which is what makes
  "the corpus already contained everything the mobile surface needed" a
  checkable claim rather than a slogan.

### Vocabulary

- **production probe** — the typing surface. The player produces the witness;
  fluency against their own baseline is the evidence.
- **discrimination probe** — the reading surface. The player picks the claim
  out of a closed set; recognition is the evidence, and it is weaker.
- **claim** — the one sentence a step asserts about its own change, derived
  from `rationale.cause`, `obligation` or `goal` in that order. Distinct from
  LTY-WHY's _candidate_, which is one of several authored rationales for one
  step; a claim is a step's own, and every step has exactly one.
- **distractor** — another step's claim, offered beside this step's.

### What the implementation settled

**The reading unit is a step, not an exercise.** One card, one hunk, one
question — the same `useExerciseRunner` the typing surface sequences with,
advanced with `"advance"` and never with `"repeat"` or `"escape"`, because
there is no gate to fall short of.

**Determinism reaches the distractors.** `lib/leetype/deterministic-random`
holds the xorshift32 that `exercises/scheduling.ts` used to keep private; both
callers share it so "seed 7" cannot come to mean two things. A story, a test
and a replayed bug report from one seed all show one screen, distractor
ordering included.

## LTY-SEED: the corpus is generated content, not fetched content

Tracked in [#1105](https://github.com/paulgsc/some-ui/issues/1105). The
corpus gains a path by which a new exercise arrives:
`packages/some-content/prompts/leetype-exercise-generator/index.md`, a
prompt a person hands to an oracle, reviews the result against the two
families' own validity constraints (#1005's six for diagnostic, #1006's
authoring test for construction), and commits what survives. Nothing about
that path runs at runtime.

This decision record exists because "generated content" is exactly the
phrase that makes the wrong precedent look right. `hangul` and `topiks`
both generate content and both fetch it — a gitignored
`packages/some-content/public/<name>/` directory, a volume mount in
`infra/compose/www.yml`, an entry in `apps/www/scripts/link-content-assets.js`,
a `createDataSource`-shaped hook gated on `DATA_MODE`. Read quickly, an
oracle-authored corpus looks like a third instance of the same shape. It is
not, and the reason is not that LeetType is special — it is what
"generated" means in each case.

**Generation and fetching are orthogonal, and the axis that actually
matters is review, not origin.** `hangul`'s vocabulary is gitignored,
developer-local, regenerated-on-demand data that never passes through a
pull request — nobody reviews `vocab.json` before Docker mounts it. This
corpus is the opposite: an oracle produces a candidate, a human reads it
against the family constraints above, and only a reviewed, merged, committed
file ever reaches a player. Reviewed content is bundled; unreviewed,
developer-local content is fetched. The canon states the committed path
exactly (`docs/canon/adaptive-learning-canon.typ` **Proposition 8.1**,
**Remark 8.1**): class IV generation belongs at _authoring time_, where
non-determinism is resolved by review, and the pipeline **terminates at the
repository** — `source material → oracle → JSON artifacts → review →
repository → static client`. There is no runtime fetch anywhere in that
sentence.

**Three already-load-bearing records say the same thing from three
different files, and this epic upholds every one of them rather than
arguing with any:**

> "The corpus-fetch seam is gone, not re-typed... Keeping a fetch path
> against `Exercise` would mean two sources for one thing and a second,
> unexercised copy of a validation the shim already performs."
> — this document, above ("The corpus-fetch seam is gone, not re-typed")

> "LeetType used to be in this list, mounting a generated challenges.json and
> a tree of code samples. Both went in M20 (#887): exercises carry inline
> sources now, so the activity fetches nothing and there is nothing to
> mount. That also removes the only difference the Pages and Docker builds
> had for this activity."
> — `infra/compose/www.yml`

> "`leetype` is deliberately absent: it needs nothing injected. Its
> exercises come from its own shim (`@some-ui/leetype`'s
> `lib/leetype/exercises`), which is the single seam a future generator
> replaces — a corpus threaded through this app would be a second one."
> — `apps/www/src/components/player/session-viewport.tsx`

**The graduation path, named.** A generated exercise is a proposal, not
content, until a human has read it against the family's own validity
constraints and merged it. There is no auto-accept. Once merged, a
generated exercise and a hand-authored one are the same thing — `Step`
gains no `generated: true` flag, because review is exactly the mechanism
that erases the distinction a flag would invite a consumer to act on.
`ProvenanceSchema` stays what it already is: where the _competency_ was
distilled from, inert, never which tool wrote the file.

**What this forecloses**, recorded as decisions because each will be
proposed again by someone who has not read this section:

- **No `packages/some-content/public/leetype/`, no volume mount, no
  `link-content-assets.js` entry, no `useLeetypeCorpus` hook, no `DATA_MODE`
  branch, no `session-viewport.tsx` change.** A PR touching any of those in
  service of this epic is out of scope regardless of how small.
- **No runtime oracle call.** Nothing in `packages/ui/leetype` gains a
  network dependency, an API key, or a model name. **Theorem 8.1**
  (oracle-free scheduling) stays satisfied.
- **No `generated: true` marker, and no provenance field naming the
  generator.** A flag inviting a consumer to treat two reviewed exercises
  differently is exactly the distinction review exists to erase.

See
[`retired-curriculum-decomposer.md`](./retired-curriculum-decomposer.md) for
the new prompt's lineage and the three constraints it inherits rather than
re-derives.

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
