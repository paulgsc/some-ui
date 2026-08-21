# The exercise generator's first worked run, and what it got wrong

LTY-SEED G4 ([#1109](https://github.com/paulgsc/some-ui/issues/1109)). Ran
`packages/some-content/prompts/leetype-exercise-generator/index.md` v1.0
(as landed in G3, [#1126](https://github.com/paulgsc/some-ui/pull/1126))
against two concepts, one per family, per that story's requirement. Both
generations were reviewed against #1005's six diagnostic constraints or
#1006's construction authoring test and #1105's "Rust is the alphabet"
rule, and both survived review and landed — `seed/memoization.ts` and
`seed/binary-search-place.ts`. Rejecting everything would have been an
equally successful outcome of this story; it happened not to be needed
this time, and this log says exactly what review caught along the way
rather than treating a clean landing as nothing to report.

## A caveat on how to read this log

**The generator and the reviewer were the same agent that wrote the
prompt**, in one continuous session. That is a weaker test of the prompt's
drift-resistance than an independent oracle would be: priors from having
just argued through every constraint while writing G3 make the easiest
failure modes (syntax pedagogy, an uncompilable `-` side) less likely to
surface here than they would for a model seeing the prompt cold. Where a
finding below is a genuine, unplanned catch — the construction candidate's
prose overclaim — it is flagged as such. Where a failure mode simply did
not occur, that is recorded as "not observed under these conditions," not
as "the prompt prevents it." A future run by a fresh session (or a
different model) against the same two concepts, without sight of this log,
would be a stronger test and is worth doing if this pipeline gets a
second layer.

## The two runs

### Diagnostic: `memoization`

**Input:** `Concept: memoization` (a genuinely new id — nothing in
`CONCEPT_IDS` names redundant recomputation across recursive calls);
`Invariant violated: an overlapping-subproblems recurrence must cache a
prior result or it re-derives it exponentially many times.`

**Produced:** `diagnostic-memoization-01` — a naive recursive Fibonacci
missing its memo-table check, repaired by a three-line guard
(`if let Some(v) = memo.get(&n) { return *v; }`), patch-shaped, one
contiguous `add` run.

**Review against #1005's six constraints:**

1. **One failure.** Single cause — the missing cache check. ✅
2. **One discriminating repair.** The guard is the only change that
   converts exponential recomputation into a single lookup per distinct
   `n`; it doesn't merely mask the symptom (e.g., capping recursion depth
   would silence it without fixing anything). ✅
3. **Minimal causal surface.** The frame is the whole function body — no
   unrelated code. ✅
4. **Bounded answer.** Typed portion measured by hand against
   `typeableStreamLength`/`typedPortionOf`'s actual rule (indentation and
   newlines excluded, a lone interior space counted once): 42 keystrokes,
   under the 50-character budget. Confirmed mechanically too —
   `DiagnosticStepSchema`'s own refinement accepted the step at import
   time (see Verification below). ✅
5. **Deterministic signal.** `trace` carries call counts:
   `fib(35)` naive vs. memoized, `29,860,703` vs. `36` — computed from the
   real recurrence (`2·fib(36)−1`), not invented round numbers. ✅
6. **Revealable in isolation.** The guard sits between the function
   signature and the base case, both rendered as context — never floating
   beneath an unrelated frame. ✅

**Rust is the alphabet check:** the concept is redundant recomputation
across a recursion tree — a DSA property, not a Rust feature. The `-` side
(implicitly, the function without the guard) is valid, compiling Rust that
merely does more work than necessary; nothing here is a syntax fact the
compiler already teaches.

### Construction: `lookup-as-place`, transferred

**Input:** `Concept: lookup-as-place` (existing — `entry-03-place`'s own
concept); `Invariant violated: a sorted search's own failure branch
already encodes where an absent element belongs, so recovering that index
should never need a second scan.` Chosen specifically to extend a concept
the corpus already probes, per the story's own preference, so
`transferFrom` would have something honest to declare.

**Produced (first draft):** a `del`/`add` pair — the naive form scanning
linearly for the first element greater than the target
(`arr.iter().position(|&x| x > target).unwrap_or(arr.len())`) replaced by
`arr.binary_search(&target).unwrap_or_else(|i| i)`, with `obligation` and
the `transition` block stated as if the two forms were equivalent outright.

**What review caught, and it is the one real finding of this run:** the
two forms are **not** equivalent when the array holds a value equal to
`target`. `binary_search`'s `Ok` arm returns _some_ index where a match
exists — Rust does not guarantee which one among duplicates — while the
naive `position(|&x| x > target)` always returns the index just past every
duplicate. The first draft's prose claimed general equivalence; the code
did not actually make that claim true for every input.

The code itself was never wrong — `.unwrap_or_else(|i| i)` handles both
`Result` arms correctly, and nothing about it panics or misbehaves. Only
the authoring prose overclaimed, and it overclaimed in exactly the place
#1006's authoring test is supposed to catch it: "what conceptual claim
becomes true because this exact fragment is present" has a different,
narrower true answer than the first draft gave. **Fix:** scoped
`obligation` and the `transition`'s `before`/`after` to the case the
exercise is actually about — the target is _absent_, which is exactly the
case an insertion is happening and exactly the case `binary_search` is
guaranteed to return `Err`. Landed as
`construction-binary-search-place-01`, `obligation`: _"when a sorted
search fails to find an absent target, its own Err arm already is the
index to insert at."_

**Review against #1006's authoring test, on the corrected version:** "what
conceptual claim becomes true because this exact fragment is present?" →
_a sorted search's failure branch already structurally contains the
correct insertion index — no second linear scan is needed to recover it._
That is a claim about binary search's own guarantee, not "the learner knows
`unwrap_or_else` exists," and now it is true for every input the exercise
actually claims it for. ✅ `transferFrom: entry-03-place` shares
`lookup-as-place` — checked mechanically by `checkTransferFrom` and
confirmed by `corpus-lint`'s run (see Verification).

## The six hypothesized failure modes, confirmed or refuted

From #1109's own list, checked against what actually happened:

1. **Syntax-pedagogy drift.** Not observed in either generation — both
   probe genuine DSA content (redundant recomputation; a search's failure
   branch as structural information). Weak test, per the caveat above.
2. **A `-` side that doesn't compile.** Not observed. Verified by manual
   review of the Rust (both are small, standard-library-only functions)
   and by `corpus-lint`'s real, wasm-backed patch-alignment check passing
   on both — which confirms line-count and typed-character alignment, not
   compilation. **Not confirmed against an actual `cargo build`** — no
   Rust toolchain was exercised for this run, consistent with G5's own
   note that a real "does the `-` side compile" check is the most
   expensive one on the table and this story does not attempt it.
3. **A repair that isn't discriminating.** Not observed for the
   diagnostic's repair itself. A related but distinct problem surfaced in
   the construction candidate — not a non-discriminating witness, but
   over-general _prose_ around a discriminating witness (see above). Worth
   distinguishing: this run found a prose-precision failure mode #1109
   didn't explicitly name, not a repeat of #3.
4. **`rationale` restating the goal.** Not observed. Checked mechanically:
   `corpus-lint`'s `eitherContainsTheOther` check on `rationale.cause`/
   `rationale.whyRepairDiscriminates` passed for the diagnostic instance.
5. **Concept-id invention.** Partially confirmed, more narrowly than
   hypothesized. Verified by direct experiment (not assumed): writing
   `CONCEPT_IDS.loopProgres` (a typo of an existing key) fails `tsc`
   immediately, with a "did you mean" suggestion. But a **bare string**
   that is a typo, a coined near-duplicate, or a genuinely new concept —
   e.g. `concepts: ["memoization"]` instead of
   `concepts: [CONCEPT_IDS.memoization]` — compiles fine either way.
   _This does not mean it ships undetected_: `concepts.test.ts`'s "every
   step in the shipped corpus draws its concepts from this list" fails at
   test time for any string absent from `CONCEPT_IDS`, which already
   covers the fully-unregistered case (a typo, or a new concept nobody
   registered). **The gap that survives every existing check** is
   narrower: two _different, both-registered_ `CONCEPT_IDS` entries whose
   _values_ are near-duplicates of each other (`loop-progress` vs. a
   hypothetically coined `loop-progress-check`) — nothing today compares
   concept values for semantic overlap, only for exact-string collision
   (`concepts.test.ts`'s "no two keys collapse onto the same id"). See the
   recommendation below; this is very likely a judgment call, not a clean
   mechanical check.
6. **Plausible-but-empty.** Not observed for either landed instance — the
   only detector for this failure mode is careful review, which is what
   this section is a record of. Its absence here is not evidence it can't
   happen; it is evidence this run's review was done, not skipped.

## Classification: prompt-wording vs. a check to mechanize

- **The construction prose-overclaim (the one real finding).**
  Prompt-wording. Folded into G3, version bumped v1.0 → v1.1: a new
  paragraph in the construction section instructs the generator to scope
  `obligation`/`transition` claims to exactly what the witness guarantees,
  not to what merely looks equivalent.
- **Everything else in the self-check list that this run actually
  exercised** (goal length, patch alignment, repair budget and
  contiguity, trace presence, evidence-row budget, transferFrom's
  mechanical check) **passed against checks that already exist** —
  `DiagnosticStepSchema`/`ConstructionStepSchema`'s own refinements and
  `corpus-lint`'s existing checks. No new lint is warranted from this run
  for any of those; they are already load-bearing and already caught
  what they claim to catch.
- **Concept-id near-duplication between two registered ids.** Recommend
  G5 mark this **review-only** rather than add a lint. A fuzzy
  string-similarity check needs a threshold that is easy to write around
  (a near-duplicate a few edits away from the threshold slips past) and
  would false-positive on legitimately related-but-distinct concepts
  already in the corpus — `loopProgress` and `windowShrinking` are both
  "a measure must move toward termination," phrased differently on
  purpose because they probe different code shapes. This is exactly the
  kind of judgment #1009's own framing warns a lint not to pretend it can
  make.
- **"The `-` side compiles."** Not attempted here, consistent with
  #1109's own framing that it is the most expensive check on the table
  (it would need a Rust toolchain in a lint path every other check in
  `corpus-lint.ts` deliberately avoids). This run's own `-`-adjacent
  content (the memoization guard's surrounding context, and the
  construction step's `del` line) was checked by hand, not mechanically,
  and that remains true after this run — no new evidence here changes
  G5's own weighing of that cost.

## Verification

Both instances landed through the normal PR path, after:

```
CI=true pnpm --filter @some-ui/leetype test        # 309/309, up from 307
pnpm --filter @some-ui/leetype exec tsc --noEmit   # clean
CI=true pnpm --filter @some-ui/leetype lint:js     # clean (one pre-existing, unrelated warning)
npx prettier --check <touched files>               # clean
CI=true pnpm --filter @some-ui/leetype lint:corpus # "20 step(s) across 9 exercise(s) checked" — real, wasm-backed patch alignment
CI=true pnpm --filter @some-ui/leetype knip        # clean
```

`lint:corpus`'s pass is the strongest confirmation available without a
Rust toolchain: it runs the _real_ compiled `leetype_wasm` engine's
`rendered_source`/`classify_source` against both new instances' `patch`
overlays, not the vitest-only `‹…›`-stripping approximation — so the
line-count and mixed-line-rule claims above are checked against the
engine's own classification, not asserted from the authored string alone.
