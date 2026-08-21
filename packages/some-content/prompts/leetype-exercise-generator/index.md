# LeetType Exercise Generator

Prompt template for generating one LeetType `Exercise` — a diagnostic or
construction instance probing a single, author-supplied concept — in the
schema `packages/ui/leetype/src/types/exercise.ts` actually validates today.
The output lands as a new TypeScript module reviewed into
`packages/ui/leetype/src/lib/leetype/exercises/seed/` (LTY-SEED G2, #1107),
never fetched, never generated at runtime — see `docs/leetype/README.md`'s
LTY-SEED section for why generated content still does not reopen the
corpus-fetch seam removed in #887.

This is the successor to
`packages/some-content/prompts/leetype-challenge-generator/index.md`,
retired in #887 for emitting a format (`Challenge[]`) nothing reads any
more. `docs/leetype/retired-curriculum-decomposer.md` records what survived
that retirement; this prompt carries its three constraints forward rather
than re-deriving them:

1. **Every step is one node in a graph** — its goal is the single insight it
   gives, in one sentence (`GOAL_MAX_CHARS` enforces the bound below).
2. **The order is the linearization, and it must be honest** — a step may
   assume only its predecessors.
3. **No judgment without its own justification** — `rationale`, `obligation`
   and `concepts` are where the evidence attaches.

---

## Usage Example Header

```
Concept: [a CONCEPT_IDS entry, or a new kebab-case id if none fits — see "Concept and invariant" below]
Invariant violated: [one sentence: the specific property the source's defect, or ruled-out form, violates]
Family: [diagnostic | construction]
T: [Apply LeetType Exercise Generator v1.2]
```

Example:

```
Concept: window-shrinking
Invariant violated: a two-pointer scan's search window must strictly shrink on every non-terminating iteration, or the loop never converges
Family: diagnostic
T: [Apply LeetType Exercise Generator v1.2]
```

The generator then produces one TypeScript module (a single `export const`
`Exercise`, following the register below) and nothing else — no prose
outside code comments, no markdown fences beyond the single ` ```ts ` block,
because this is reviewed and pasted into a real file, not parsed as data the
way the hangul generator's JSON output is.

---

## Concept and invariant are supplied, never chosen by you

Concept selection is not class IV (`docs/canon/adaptive-learning-canon.typ`
**Definition 8.1**) — it does not require an open-world model of what a
learner needs next, and letting the oracle pick it would smuggle a
judgment nobody has actually made into a step nobody asked for. The human
author supplies **concept** (an existing `CONCEPT_IDS` entry, from
`packages/ui/leetype/src/lib/leetype/exercises/concepts.ts`, or a new
kebab-case id if genuinely nothing fits — read that file first) and
**the invariant it violates**, as input, before you generate anything. If
either is missing from the header, ask for it rather than inventing one.

**A genuinely new concept is a two-file change, not one.** Emit the step
against `CONCEPT_IDS.<newKey>` (never a bare string literal), and add
`<newKey>` to `CONCEPT_IDS` in `concepts.ts` in the same PR. Skipping the
registry update does not fail fast: `tsc` only catches a _typo_ of an
existing entry (property access on a name that isn't there), and a brand
new key compiles fine either way — but `concepts.test.ts`'s "every step in
the shipped corpus draws its concepts from this list" fails the moment the
module is wired into `SEED_EXERCISES`, since it checks every step's
`concepts` against `Object.values(CONCEPT_IDS)` directly. Land both edits
together, or the module doesn't merge.

---

## The one rule everything else fights: Rust is the alphabet, not the subject

**No exercise in this corpus teaches Rust.** Not how to declare a variable,
not what `impl` means, not which method is on `Vec`. A learner who forgets
`use std::collections::HashMap;` gets told by the compiler, instantly, for
free — no exercise is needed to nudge a fact the toolchain nudges harder.

State the rule as a rule, because it is the constraint you will drift from
first: **the source in the hunk already compiles; the defect is invisible
to the type checker.** A diagnostic step's `-` side is not "code with a
typo" — it is a _valid_ prior attempt whose defect is conceptual (an
algorithmic bound, a memory-growth property, a recursion depth, a cache or
allocation consequence, a latency constraint, a security invariant). A
construction step's witness is never "the API call the reader hasn't
memorized yet" — see the authoring test below.

If you cannot state the concept being probed without naming a Rust type,
trait, or standard-library method, stop: you have written a bridge
(LTY-ROUTE), not an exercise, and this prompt does not produce those.

---

## Schema (`packages/ui/leetype/src/types/exercise.ts`, read at generation time — this is a snapshot)

```ts
type Step = {
  id: string // kebab-case, unique across the whole corpus, not just this exercise
  goal: string // ≤140 chars (GOAL_MAX_CHARS) — one sentence, what the player achieves, not "type the following"
  blocks: Array<Block> // exactly one "typing" block; the rest are prompt-side
  concepts: Array<string> // non-empty; CONCEPT_IDS entries
  provenance?: { source: string; locator?: string } // inert; never rendered
  transferFrom?: string // another step id this step transfers from — only if genuinely true

  // diagnostic family only:
  rationale?: { cause: string; whyRepairDiscriminates: string }

  // construction family only:
  obligation?: string // authoring metadata, never rendered to the learner
}

type TypingBlock = {
  kind: "typing"
  source: string // ‹…› marks context spans (rendered, never typed); everything outside is typed
  language: "rust" // this corpus is Rust
  patch?: {
    path: string // a plausible file path, e.g. "src/scan/window.rs" — never rendered through provenance
    oldStart: number
    newStart: number
    lineKinds: Array<"context" | "del" | "add"> // one entry per RENDERED line (after ‹…› stripping), see "The hunk shape" below
  }
}

// evidence blocks — read, never typed, at most EVIDENCE_ROW_BUDGET (6) rows total per step:
type TraceBlock = {
  kind: "trace"
  headline?: string
  observations: Array<{ label: string; value: string }>
}
type TransitionBlock = {
  kind: "transition"
  label?: string
  before: string
  after: string
}
type PromptBlock = { kind: "prompt"; lines: Array<string> } // ≤2 lines, ≤120 chars each (PROMPT_MAX_LINES/PROMPT_LINE_MAX_CHARS) — a pointer, not a paragraph
```

`Exercise` is `{ id: string; title: string; steps: Array<Step> }` — for this
prompt, always exactly one step, one exercise. A multi-step chain (like
`entry-api.ts`'s ten-step ladder) is an authored decision about a whole
curriculum, not something this prompt generates in one pass; run it once
per step and hand-assemble the chain if you are building one.

---

## The two families — pick the one the header names, and satisfy _its_ constraints

### Diagnostic (falsification → repair)

The six validity constraints (#1005), stated so each is either checked
below or marked as judgment for the reviewer:

1. **One failure.** One principal causal defect. Two independent repairs is
   two steps. _(judgment — argued in `rationale.cause`)_
2. **One discriminating repair.** The repair distinguishes the intended
   misconception, not merely silences the symptom. `return true` is not a
   boundary competency; `return index < items.len()` is. _(judgment —
   argued in `rationale.whyRepairDiscriminates`)_
3. **Minimal causal surface.** The frame omits everything unrelated to the
   fault. _(judgment)_
4. **Bounded answer.** Seconds to copy once revealed, not a minute. _(checked
   — the typed portion must be ≤50 keystrokes, `DIAGNOSTIC_REPAIR_MAX_CHARS`)_
5. **Deterministic signal.** `expected 3, received 4`, never "something went
   wrong" — this is what the step's `trace` block carries. _(partly checked
   — a `trace` block must be present; whether its `observations` actually
   read as deterministic is judgment)_ **A number in a `trace` observation
   must be verified, not estimated** — trace through the actual code (or
   execute it) for the specific quantity the label names, and make sure the
   label names the quantity you actually computed. "36 distinct subproblems"
   and "69 total calls" are both real, correct numbers for a memoized
   `fib(35)` — they are not interchangeable, and labeling one as the other
   is a false deterministic claim even though the number itself is real.
6. **Revealable in isolation.** The repair sits inside the frame, anchored
   at the point in the surrounding code where it belongs — never appended
   after all the context with nothing following it. Concretely: the repair
   _is_ the text outside the `‹…›` markers (everything inside one is
   rendered but never typed), and that untyped portion should itself be
   flanked by context on at least one side, the way
   `entry-03-place`'s `‹let slot = ›map.entry(key)‹;›` wraps its addition
   between a context prefix and suffix. Do not write the repair _as_ a
   context span — that produces an exercise with nothing left to type.
   _(structurally guaranteed by LTY-FRAME as long as you get this right — a
   diagnostic step's typing block always renders in place)_

A patch-shaped repair's `add` lines must additionally form **one contiguous
run** — one fault, one edit — checked mechanically against `patch.lineKinds`.

### Construction (obligation → witness)

The authoring test (#1006), the acceptance criterion for this family:

> What conceptual claim becomes true **because this exact fragment is
> present**?

If the honest answer is "the learner knows a method name," the step is a
bridge, not an obligation — do not generate it. `obligation` states the
concept-bearing decision the witness discharges; it is never rendered to
the learner, so write it as an argument for the reviewer, not as
in-character prose.

A construction step needs at least one visible constraint or consequence
block besides its witness (`transition`/`trace`/`region`/`prompt`) — a
witness with nothing surrounding it is a blank with no reason given for
what it discharges.

**Scope `obligation` and the transition's `before`/`after` to exactly what
the witness guarantees, never to what merely looks equivalent.** A witness
can be correct Rust while the prose _around_ it overclaims — e.g. two forms
of a lookup that agree on the common case (the target is absent) but would
diverge on an edge case neither form was written to handle (duplicates of
the target present). If the witness only guarantees the claim for a
specific case, say so in `obligation`/`before`/`after` rather than writing
as if it holds unconditionally — an authoring test that passes for the
wrong reason is exactly the failure #1006's own test exists to catch, and
prose is where a generator drifts into it even when the code is fine.

**A construction `-` line, if you use one, is a genuinely ruled-out form —
never a blank with a hint over it.** Showing the eager, naive, or
previously-committed alternative in full is only worth doing when the
contrast _is_ the evidence for why the chosen form is owed (see
`seed/lazy-default.ts`'s `construction-lazy-default-01` for a worked
instance: the eager `or_insert(build_default())` is shown solely so its
contrast with `or_insert_with(build_default)` argues for laziness). A `-`
line that merely makes the `+` line guessable by elimination fails the
authoring test above just as surely as a bad `obligation` does.

---

## The hunk shape (LTY-PATCH, `docs/leetype/README.md`)

`source` uses `‹…›` to mark context — rendered as code, read, never typed.
Everything outside a `‹…›` span is the typeable stream. `patch` is optional;
add it whenever the exercise reads naturally as a diff (most diagnostic and
many construction steps do) — it is not required for a single uninterrupted
`+` line with no surrounding context.

`patch.lineKinds` has one entry per **rendered** line (i.e. after `‹…›`
delimiters are stripped, not per line of the raw authored string) — the
mixed-line rule: a rendered line is `"add"` if it contains **at least one**
typed character, even mostly-inherited ones; `"del"` if the whole line is
being shown as removed; `"context"` otherwise. `"del"` and `"context"` are
identical to the engine (LTY-PATCH P1) — the difference is authorial intent
about what the renderer paints, not a schema distinction it can check for
you, so choose `"del"` only for a line you mean to show as struck-through
removed code.

Worked example (`seed/loop-progress.ts`'s `diagnostic-loop-progress-01`):

```ts
source:
  "‹while cursor < input.len() {\n    parse(input[cursor]);\n    ›cursor += 1;‹\n}›",
patch: {
  path: "src/parse/cursor.rs",
  oldStart: 1,
  newStart: 1,
  lineKinds: ["context", "context", "add", "context"],
},
```

Four rendered lines: the `while` line and the `parse` line are pure
context; `    cursor += 1;` mixes inherited indentation (context) with the
one typed statement, so the _whole rendered line_ reads `"add"`; the
closing `}` is context. No `"del"` line here — the fault is an absence, not
a visibly wrong line, which is as legitimate a hunk shape as one with a
removed line.

A multi-line repair is allowed and does not need to fit on one line — the
bound is volume (≤50 typed keystrokes) and contiguity (one `"add"` run), not
line count. `seed/division-guard.ts`'s `diagnostic-division-guard-01` is a
three-line guard clause, one contiguous `add` run, well inside budget.

---

## Two rejected examples, with reasons

Rejected, not merely "avoid this" — these are the shapes a generator left
to its own devices produces most often, and each one looks plausible until
checked against the rule above.

**Rejected #1 — syntax pedagogy dressed as a diagnostic step:**

```ts
// REJECTED
{
  goal: "Bring HashMap into scope so the map compiles.",
  rationale: {
    cause: "the code uses HashMap without importing it",
    whyRepairDiscriminates: "the use declaration is the only missing piece",
  },
  // typed repair: "use std::collections::HashMap;"
}
```

Rejected because the compiler already teaches this, instantly, for free — a
missing `use` is a compile error, not a conceptual defect invisible to the
type checker. This is exactly the "Rust is the alphabet" violation the rule
above names. (Compare `entry-01-import` in `seed/entry-api.ts`, which
_does_ type this line — but as the first rung of a ladder building toward a
real abstraction, never as a standalone diagnostic about forgetting an
import.)

**Rejected #2 — a construction step that fails its own authoring test:**

```ts
// REJECTED
{
  goal: "Append to the vector using the method that adds to the end.",
  obligation: "the learner knows push adds an element to the end of a Vec",
  // typed witness: "items.push(value);"
}
```

Rejected by #1006's own test: the honest answer to "what conceptual claim
becomes true because this exact fragment is present" is "the learner knows
a method name" — that is a bridge (LTY-ROUTE), not an obligation. A real
construction step's fragment has to make a conceptual claim true, the way
`entry-04-fill`'s `or_insert_with` makes "the default can be deferred"
true — not merely recall an API's existence.

---

## Self-check list

Every item below is a candidate for the corpus lint (LTY-SEED G5) to
mechanize eventually — write your own instance against each one, and treat
"I did not check this" as a reason not to submit the module yet. Marked
`[checkable]` where the shape alone can be verified without judging quality,
`[judgment]` where only a human reviewer can call it.

- [checkable] `goal` is ≤140 characters and reads as an achievement, not an
  instruction ("type the following" is not a goal).
- [checkable] `concepts` is non-empty and every entry is either an existing
  `CONCEPT_IDS` value or a new, genuinely-needed kebab-case id.
- [checkable] Exactly one `typing` block; every other block is prompt-side.
- [checkable] If `patch` is present, `lineKinds` has exactly one entry per
  rendered line (after `‹…›` stripping), and every `"add"`-marked line
  contains at least one typed character while every `"context"`/`"del"`
  line contains none (the mixed-line rule).
- [checkable] Diagnostic only: the typed repair is ≤50 keystrokes
  (excluding layout whitespace and newlines) and, if patch-shaped, its
  `"add"` lines form exactly one contiguous run.
- [checkable] Diagnostic only: a `trace` block is present.
- [checkable] Construction only: at least one block besides the typing
  block (a visible constraint or consequence).
- [checkable] Combined prompt-side prose is ≤2 lines total, ≤120 characters
  each (`PROMPT_MAX_LINES`/`PROMPT_LINE_MAX_CHARS`), and total evidence rows
  (`prompt` lines + `transition`s + `trace` headline/observations +
  `region`s) do not exceed 6 (`EVIDENCE_ROW_BUDGET`).
- [checkable] If `rationaleChoices` is used, 2–5 candidates
  (`RATIONALE_CHOICES_MAX`), and no candidate is a prefix of another.
- [judgment] The `-` side (if any) is genuinely valid Rust that would
  compile in context — not merely plausible-looking.
- [judgment] The repair or witness actually discriminates the stated
  concept, rather than being incidentally correct for the wrong reason.
- [judgment] `rationale.cause` and `rationale.whyRepairDiscriminates` (or
  `obligation`) argue two different things, neither restating the other or
  quoting the typed code back as prose.
- [judgment] The exercise probes the stated concept, not a Rust API or
  syntax feature — the single question worth re-asking last: could a
  learner solve this by pattern-matching a method name rather than
  reasoning about the concept?
- [judgment] A newly coined concept id is not a near-duplicate of an
  existing `CONCEPT_IDS` entry — the same idea under a different name.
  Not mechanically checkable (LTY-SEED G5 considered and rejected a
  fuzzy-match lint for this — see `corpus-lint.ts`'s module doc for why).
- [judgment] Every specific number in a `trace` observation was verified
  against the actual code — executed or carefully hand-traced — for the
  exact quantity its label names, not merely computed correctly for some
  _related_ quantity (G4's own run landed a real instance of this: a
  correct count of distinct subproblems, mislabeled as a call count).

---

## After Generating

- **Land it as a new module**, following the register of
  `packages/ui/leetype/src/lib/leetype/exercises/seed/*.ts` (LTY-SEED G2):
  one file, named for the concept or failure class it probes, exporting one
  `Exercise` constant. Wire it into that directory's `index.ts`'s
  `SEED_EXERCISES` array — `knip` will flag the module if you forget.
- **This is a proposal, not content, until reviewed.** Check it against the
  family constraints above and #1105's "Rust is the alphabet" rule before
  it lands — the review step is not ceremony, it is the entire mechanism by
  which this corpus stands behind a non-deterministic oracle's output (see
  `docs/leetype/README.md`'s LTY-SEED section). Reject rather than land a
  plausible-but-empty exercise: schema-valid and lint-clean is necessary,
  not sufficient.
- **Never add a `generated: true` field, a provenance entry naming this
  prompt, or any path under `packages/some-content/public/leetype/`.** Once
  reviewed and merged, a generated exercise and a hand-authored one are the
  same thing.
- Run, before opening a PR: `CI=true pnpm --filter @some-ui/leetype test`,
  `pnpm --filter @some-ui/leetype exec tsc --noEmit`, `lint:js`, `prettier`,
  `lint:corpus`, `knip`.

---

## Versioning

**`v1.2`.** LTY-SEED G5 (#1110) reviewed every self-check item below
against G4's actual findings and added no new mechanizable check — the
run's two real findings were both prose imprecision, already folded in as
the v1.1 wording fixes below, and every other item was already covered by
`DiagnosticStepSchema`/`ConstructionStepSchema` or `corpus-lint.ts`. Two
items are now marked `[judgment]` here that weren't broken out before:
near-duplication between two registered `CONCEPT_IDS` entries, and
verifying a `trace` number against the exact quantity it claims — both
argued as deliberately left to review, not silently skipped, in
`corpus-lint.ts`'s own module doc.

**`v1.1`.** LTY-SEED G4 (#1109) ran `v1.0` for real against two concepts —
`memoization` (diagnostic) and `lookup-as-place` transferred to a sorted
`Vec` (construction) — landed as `seed/memoization.ts` and
`seed/binary-search-place.ts`. Full findings, including what was rejected
and why, are in
[`docs/leetype/leetype-exercise-generator-log.md`](../../../../docs/leetype/leetype-exercise-generator-log.md).
`v1.1` folds in the two wording fixes that run produced: the "Scope
`obligation` and the transition's `before`/`after`..." paragraph in the
construction section above, added after the run's construction candidate
correctly generated compiling code but overclaimed its general equivalence
to the form it replaced; and constraint 5's "A number in a `trace`
observation must be verified, not estimated" sentence, added after a PR
reviewer caught the diagnostic candidate's landed `trace` labeling a real,
correctly-computed number (36, the count of distinct subproblems) as a
different quantity (the number of function calls, actually 69) — the value
was right, the label named the wrong thing.
