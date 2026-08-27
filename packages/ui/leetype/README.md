# `@some-ui/leetype`

A competency probe whose input modality is whatever the device can carry.

On a keyboard, the player reads one sentence, types the smallest code that
proves it, and repeats; everything else — how much of the code is visible,
whether they may move on — is inferred from how they type. On a phone they
read the change and say what it does instead. There is no challenge picker, no
session configuration, no clock that ends anything, and no XP on either.

```tsx
import { Leetype } from "@some-ui/leetype"

;<Leetype />
```

That is the only way in. `Leetype` mounts with no required props: the
exercise comes from the shim (`lib/leetype/exercises`), and a host that wants
a specific one passes `exercise`.

**Below 768px it is a different probe** (LTY-MOBILE). A phone has no keyboard
to produce code with, so the small-screen surface asks the player to read a
change and pick out the claim it makes, rather than to type it. Same corpus,
same runner, same schedule — a weaker signal, honestly weaker, and no engine
at all: `@some-ui/leetype-wasm` is never fetched on a phone. The host does
nothing to opt in.

> [!IMPORTANT] > **Canon-governed workspace — read the canon before editing this package.**
>
> - [`docs/canon/adaptive-learning-canon.typ`](../../../docs/canon/adaptive-learning-canon.typ) — _The Unobservable Learner_. §6–§7 are what the M20 rewrite discharged: the `adaptiveHidden` latch (Prop. 6.1) is gone, replaced by an engine-owned control loop; `PlayerProgress.solves` (Prop. 7.1) is gone, replaced by one bounded baseline sample; XP and level (Prop. 2.1) are gone entirely. A change that reintroduces any of them needs a citation, or an amendment
>
> These are not background reading. They are the documents this package is
> _derived_ from: modules here are checked against a Definition / Axiom /
> Theorem number, not against a feature spec. If a change cannot be traced to
> a canon citation, either it belongs somewhere else or the canon is missing
> an amendment that should land first.
>
> **Human reviewers:** a diff that changes behaviour governed by a canon and
> cites nothing is incomplete — ask for the citation.
> **LLM agents:** read the cited sections before proposing a change, and never
> silently renumber or rewrite a canon result. See
> [`docs/canon/README.md`](../../../docs/canon/README.md) for the amendment
> discipline.

## The decision record

[`docs/leetype/README.md`](../../../docs/leetype/README.md) carries the
vocabulary and the five decisions this package assumes. Read it before
touching the shell or the reveal loop — it outlives the issues that closed.
Its LTY-MOBILE section is the one to read before touching either surface's
boundary: it records what the small-screen path may render that the desktop
path may not, and why.

## The shape

```text
Leetype                        picks a modality, and nothing else
│
├── TypingSession   ≥ 768px    composition, not orchestration
│   ├── useExerciseRunner      which step, and when to leave it
│   │                          (holds no typing state, ever)
│   ├── useTypingGame          slots, caret, reveal, the two WPM figures
│   │                          (has no idea what a step is)
│   └── ExerciseCard
│       ├── PromptPanel        fixed ~20%, outside the scroll model
│       └── TypingViewport     the one scroll container in the card
│           └── CodeDisplay    a pure glyph renderer
│
└── ReadingSession  < 768px    the same corpus, a discrimination probe
    ├── useExerciseRunner      the same hook, advanced and never repeated
    ├── readingProbeOf         a card derived from authored data alone
    ├── DiffCard               the focal object: one unified hunk
    ├── ClaimChoices           a real radio group that looks like rows
    └── ReadingFeedback        the author's reason, no verdict of its own
```

Four boundaries hold the typing branch together, and each is worth stating
because each was crossed by the version this replaced:

1. **`CodeDisplay` knows nothing about exercises.** Its props contain no
   prompt, step or competency vocabulary. Adding a new prompt-side block
   kind must never reach it.
2. **The prompt is not in the scrolling model.** Exactly one element in the
   card declares `scroll-intent`, and it is the typing viewport.
3. **Masking is engine state.** The renderer draws a per-slot visibility map
   and owns no policy. No React state anywhere describes whether code is
   hidden.
4. **No absolute WPM constant survives.** Every threshold is a fraction of
   the player's own sampled baseline (`lib/leetype/baseline-store`), which is
   ephemeral: clearing it costs one warm-up and nothing else.

The reading branch has a boundary of its own, and it is the one to check a
change against first:

5. **The reading path imports nothing engine-shaped.** No `types/leetype`
   vocabulary, no wasm loader, no typing hook — `lib/leetype/reading-probe` is
   a pure function of authored corpus data and `DiffCard` takes a hunk and
   nothing else. That is what makes "a phone never loads the engine" true by
   construction; `components/leetype/index.test.tsx` pins it, with a negative
   control that asserts the wide branch does load it.

## Where the engine ends and this package begins

The reveal loop, both WPM figures, and the gate all live in
`crates/leetype_wasm`. That is not an implementation detail — it is what
makes them provable:

```bash
cargo test -p leetype_wasm
```

is the single command that proves the loop cannot oscillate, cannot lock a
player out, cannot un-reveal text under the caret, and cannot trap an
exercise. `tests/invariants.rs` runs those as properties over a synthetic
player model, with a negative control that collapses the deadband and
asserts the flicker comes back — a hysteresis test that passes without
hysteresis is not a test.

## Where the exercises come from

`lib/leetype/exercises` exports exactly one function:

```ts
nextExercise(state?: SelectionState): Exercise
```

It is a hard-coded array behind a validated seam, standing in for

```text
source → AST → concept extraction → evidence graph → difficulty estimation
       → minimal competency decomposition → forcing-question wording → steps
```

with everything left of the last arrow deferred out of M20. The acceptance
test for the real pipeline is narrow: _it emits what the shim emits._ Nothing
outside that module imports the seed data, so replacing it touches one file.
