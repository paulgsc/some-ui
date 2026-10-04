# LeetType Round Generator

You are writing one **round** for a phone app that teaches algorithmic cost.
A round is a small Rust function that is fast enough under some input bounds
and too slow once the bounds grow, plus a short list of candidate rewrites.
The learner picks the rewrite that fixes it, then names the proposition that
rewrite witnesses. Return the round as one JSON object (see **Output**). The
learner pastes your reply back into the app, which checks it and plays it.

The app checks your round mechanically before anyone plays it: every hunk must
apply to the program, and every admissibility claim must match what the cost
graphs compute. A round that fails a check is not played. Write carefully,
then run the **Self-check**.

---

## The governing rule: the proposition is about cost, never about syntax

The learner is never asked whether code is correct or idiomatic. Every
rewrite in a round must **preserve the function's behaviour**: same result
for every input. Rewrites differ only in how much work they do. A wrong
rewrite is wrong because it does not restore the budget, never because it has
a bug. A "distractor" that changes the answer is a strawman, and the app
rejects the idea on sight: every non-admissible member carries a
`distractorStatement` saying, in one or two plain sentences, why it is a
real rewrite that still costs too much.

**Never write a complexity class.** No `Θ(`, `O(`, `Ω(`, "quadratic",
"n log n time" as a class claim, anywhere: not in prose, not in code
comments. The app computes cost from your cost graphs; an asserted class is
a claim the round is not allowed to make. Describe work concretely instead:
"compares every pair", "one pass over the neighbours", "about half as many
comparisons".

---

## The round, field by field

A round is `(A, C, B, D, μ)`:

- **`A`, `algorithm`**: a complete Rust function.
  - `language` is always `"rust"`.
  - `source` must compile on its own as a library item under
    `rustc --crate-type lib -D warnings`: `pub fn`, no `main`, no crates, no
    unused variables, no `unsafe`. End the source with a newline.
  - `entryPoint` is the function's signature, e.g.
    `"has_duplicate(values: &[i64]) -> bool"`.
  - `inputAlphabet` says in one sentence what the inputs are and names every
    dimension you bound (`n is values.len()`).
- **`C`, `constraintDiff`**: `before` and `after`, each a list of
  `{ "dimension", "operator", "bound" }`.
  - Both lists name the same dimensions with the same operators; at least
    one bound changes. Use `"<="`.
  - `A` must be **admissible** under `before` and **inadmissible** under
    `after`. That is the round's premise: the bounds grew and `A` stopped
    fitting.
  - Bound only dimensions the cost actually depends on.
- **`B`, `budget`**: `{ "operations": 100000000, "wallClock": "about a second" }`.
  Keep this budget unless the request says otherwise. It is an
  order-of-magnitude figure, not a measurement.
- **`G`, `graph`**: `A`'s worst-case cost graph (see **Cost graphs**).
- **`D`, `diffOptions`**: 2 to 5 members. Exactly **one** has
  `member.admissible: true`: the rewrite whose cost graph fits the budget
  under `after`. Every other member is a real, behaviour-preserving rewrite
  that still does not fit.
- **`μ`, `member.propositionId`**: for each member, the register entry (see
  **The register**) that the member's rewrite **witnesses**. It names what
  the rewrite _does to the cost_, whether or not that is enough. A `break`
  on the first match witnesses `CW-P8` ("an early exit does not change the
  worst case") even though it is the wrong choice here.

Each member of `diffOptions` is:

```json
{
  "member": {
    "hunk": { "path": "...", "oldStart": 1, "newStart": 1, "segments": [...] },
    "propositionId": "CW-P6",
    "admissible": true,
    "propositionGloss": "One or two sentences on what this rewrite does to the work.",
    "distractorStatement": "Required when admissible is false."
  },
  "graph": <the cost graph of A with this hunk applied>,
  "rescueCandidates": [...],
  "explanationPropositionId": "CW-P16"
}
```

### Hunks

A hunk is one contiguous edit to `A`, written as segments:

- `path`: one file name, the same for every member (e.g. `"src/has_duplicate.rs"`).
- `oldStart`: the 1-based line of `A` where the hunk's first segment starts.
  `newStart` equals `oldStart`.
- `segments`: a list of `{ "kind": "context" | "deletion" | "addition", "text": "..." }`.
  - Concatenating every `context` and `deletion` text, in order, must equal
    `A`'s source **exactly**, character for character, starting at the
    beginning of line `oldStart`. Copy lines from `source`; do not retype
    them. Indentation is four spaces.
  - Every segment's `text` is whole lines, each ending in `\n`.
  - The patched program (context + additions in place of context +
    deletions) must also compile under the same `rustc` flags.
- A hunk must change something: at least one addition or deletion.

### Cost graphs

A cost graph is a term in three constructors, as JSON:

- Work: `{ "kind": "work", "cost": 1 }`: a constant amount of work.
- Sequence: `{ "kind": "seq", "children": [G1, G2, ...] }`: costs add.
- Loop: `{ "kind": "loop", "repetition": [factors], "body": G }`: the body
  runs `repetition` times.

A repetition is a product of factors, each
`{ "kind": "pow" | "log", "dimension": "n", "exponent": 1 }`:

- `n` is `[{ "kind": "pow", "dimension": "n", "exponent": 1 }]`.
- `n²` is `[{ "kind": "pow", "dimension": "n", "exponent": 2 }]`.
- `m · log m` is
  `[{ "kind": "log", "dimension": "m", "exponent": 1 }, { "kind": "pow", "dimension": "m", "exponent": 1 }]`.
- A constant repetition is `[]`.

Factors must be normalized: no exponent 0, no dimension repeated within one
kind, every `log` factor before every `pow` factor, and dimensions in
alphabetical order within each kind.

Model the **worst case**. An early exit that fires only on some inputs does
not shorten a loop. A sort of `m` items is `Loop(m · log m, Work(1))`. A
binary search over `m` items is `Loop(log m, Work(1))`. A hash lookup is
**not** constant in the worst case here: do not write rounds whose
admissible member depends on expected-case hashing.

The app evaluates each graph by substituting each dimension's bound
(`log` is base 2) and compares the total to `budget.operations`. So:

- `graph` must fit the budget under `before` and exceed it under `after`.
- Exactly the admissible member's `graph` fits under `after`.
- Every graph mentions only dimensions that `constraintDiff` bounds, and
  every bounded dimension appears in `graph`'s cost.

### Rescue candidates and the fallback question

When the learner picks a member that does not fit, the app asks a follow-up
question instead of just marking it wrong:

- `rescueCandidates`: bound sets `C″` under which that member's graph
  **would** fit. Each one names the same dimensions and operators as
  `after`, with at least one bound changed, plus the `propositionId` that
  explains why it rescues (usually `CW-P4`). Use an empty list for the
  admissible member, and for a member no bound change can rescue.
- `explanationPropositionId`: the entry the learner must name when no
  candidate rescues. Use `"CW-P16"` unless another entry fits better.

---

## The request

The request at the end of this prompt gives:

- **Focus:** optional, the proposition the admissible member should witness.
  Otherwise choose one that the learner's history below suggests, or any.
- **Premise:** optional, a problem to build `A` around. Otherwise invent a
  small, concrete one (counting, searching, deduplicating, pairing,
  prefix sums, intervals). Keep `A` under 30 lines.
- **Members:** how many members `D` has (default 3).
- **Recent rounds:** optional, rounds the learner has played. Do not reuse
  their programs, and prefer a different focus unless asked.
- **Learner notes:** optional, what the learner said while playing, each on
  one part of a round (the program, the bounds, the budget, the rewrites,
  the proposition question, the runs). Write this round against them, and
  never mention them in the round itself:
  - _could not tell what was being asked_: the fault is the round's wording,
    not the learner. Use plainer names, a shorter `A`, and a
    `distractorStatement` that says in everyday words what the rewrite does.
  - _did not know this_: a gap. Prefer a focus that approaches it from a
    simpler premise, rather than repeating the same one.
  - _thinks this is wrong_: the learner may be right. Take extra care with
    the part they named, and run the **Self-check** on it twice.
  - _noted_: anything else; use it if it helps.

---

## Self-check (do this before you answer)

1. Does `A` compile as a library under `-D warnings`? Does every `A + d`?
2. For every hunk, is context + deletion text a verbatim substring of `A`
   starting at the first character of line `oldStart`?
3. Is every rewrite behaviour-preserving?
4. Evaluate every graph at `before` and `after` by hand. Does `A` fit
   before and not after? Does exactly one member fit after?
5. Does every non-admissible member have a `distractorStatement`, and does
   each `rescueCandidates` entry actually make that member's graph fit?
6. Does each `propositionId` name what that member's rewrite does to the
   cost, using only identifiers from the register below?
7. Is there any `Θ(`, `O(`, `Ω(` or class name anywhere? Remove it.

---

## Output

Reply with exactly one ```json fenced block containing the round object,
and nothing else inside the fence. Its `id` is a short kebab-case name for
the problem (`count-present-sorted-lookup`). Text outside the fence is
ignored.
