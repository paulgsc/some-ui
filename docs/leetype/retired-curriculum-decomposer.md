# The Curriculum Decomposer prompt, and where its job went

`packages/some-content/prompts/leetype-challenge-generator/index.md` held a
475-line prompt template that generated a `Challenge[]` corpus: a
decomposition of one dense programming problem into a linearized ladder of
challenges, each with a `curriculum` node, reference Rust sources on disk,
and a `master` entry that was the original problem.

It was retired in **M20** ([#887](https://github.com/paulgsc/some-ui/issues/887)),
not because its reasoning was wrong but because it generated a format nothing
reads any more. `Challenge` is a whole problem plus file paths per language;
`Exercise` is a sequence of steps with inline sources, and the surface that
consumed a corpus — the challenge picker — no longer exists.

Leaving a prompt that emits a dead format is worse than deleting it: the next
person to run it gets a file the app silently ignores.

## What survives, and where it goes

The prompt's actual claim — that the deliverable is a _pedagogical
decomposition_, not a set of coding challenges, and that challenge generation
is the last stage of a pipeline that starts with inferring a knowledge graph
— is exactly the ambition M20 quarantines rather than abandons:

```text
source → AST → concept extraction → evidence graph → difficulty estimation
       → minimal competency decomposition → forcing-question wording → steps
```

Everything left of the last arrow is deferred. What ships instead is a
hand-authored shim behind one function
(`packages/ui/leetype/src/lib/leetype/exercises`), which occupies the last
arrow only.

Three constraints the prompt carried are worth reinstating verbatim whenever
that pipeline is written, because they are the parts that made it a
decomposition rather than a list:

1. **Every step is one node in a graph.** Its goal is the single insight it
   gives, in one sentence. `Exercise`'s schema enforces the sentence bound
   (`GOAL_MAX_CHARS`) for exactly this reason: if the goal needs a paragraph,
   the step was too broad.
2. **The order is the linearization, and it must be honest.** A step may
   assume only its predecessors. Nothing in the current schema enforces that
   — `concepts` is a bag of strings — and pretending otherwise would be
   inventing the judgment M20 defers.
3. **No judgment without its own justification.** "This module demonstrates
   ownership" → show the spans. "Reveal the next two tokens" → show the
   latency that crossed the threshold. `provenance` and `concepts` are where
   that evidence attaches; they are optional and inert today because nothing
   has earned them yet.

## The acceptance test for the replacement

Narrow, and stated here so it does not have to be re-argued: **the pipeline
emits what the shim emits.** Same `Exercise` value shape, same schema, same
single function. A pipeline that wants a different shape is proposing a
change to `packages/ui/leetype/src/types/exercise.ts`, argued on its own
merits — not a format decision made on the way past.

## Where the successor lives

[#1105](https://github.com/paulgsc/some-ui/issues/1105) (LTY-SEED) is that
replacement. The generator prompt is
`packages/some-content/prompts/leetype-exercise-generator/index.md` — the
same `Exercise` value shape, the same schema, the same single `nextExercise`
seam the acceptance test above demanded, so that test is not retired, only
finally checkable against something real.

That prompt cites this document's three surviving constraints (one node per
insight, an honest linearization, no judgment without justification) rather
than re-deriving them, and adds one constraint this document had no schema
to state yet: concept selection is not itself class IV
(`docs/canon/adaptive-learning-canon.typ` **Definition 8.1**), so the human
author supplies the concept and the invariant it violates as input, rather
than leaving the oracle to choose them. See
[`docs/leetype/README.md`](./README.md)'s own LTY-SEED section for the full
decision — in particular why oracle-authored content still does not fetch
anything at runtime, the same conclusion this document's own "corpus-fetch
seam is gone" note already reached from the opposite direction.
