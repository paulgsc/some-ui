# LeetType: a competency probe whose input modality happens to be typing

This is the decision record for the user-story shift tracked in
[#851](https://github.com/paulgsc/some-ui/issues/851) and decomposed across
milestone **leetype (M20)**. The epics carry the work; this file carries the
vocabulary and the four decisions the work assumes, because those outlive
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

## The four decisions

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

## Where the magic is quarantined

The full ambition is a compiler, not a prompt:

```
source → AST → concept extraction → evidence graph → difficulty estimation
       → minimal competency decomposition → forcing-question wording → steps
```

Every arrow left of the last one is **deferred out of M20**. What ships is a
hand-authored TS shim behind a single function, which occupies the last
arrow only. That is not a shortcut around the interesting problem — it is
the sequencing: the mechanical half (shell, reveal loop, gate) has to be
playable before there is anything to judge the judgment against.

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

## Why this is a `.md` and not a `.typ`

`docs/canon` is for claims that want citation-checked proof obligations.
Nothing here is metamathematics — it is an architecture decision plus a
vocabulary. The invariants this design _does_ owe (no oscillation, monotone
reveal, bounded convergence) are discharged as property tests in
`crates/leetype_wasm/tests/invariants.rs`, which is a stronger place for
them than prose.
