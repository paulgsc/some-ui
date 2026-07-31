# Curriculum Decomposer

Prompt template for generating a `Leetype` challenge-pool override.

**The deliverable is not a set of coding challenges.** It is a **pedagogical
decomposition**: given one dense programming problem, infer the latent
knowledge graph behind it and emit the minimal sequence of exercises that
walks a learner from the first prerequisite to the original problem.

> The generator's primary responsibility is not to generate challenges, but to
> infer the latent knowledge graph behind a programming problem and produce a
> minimal pedagogical decomposition. Every generated challenge corresponds to
> a single node in that graph. **The final node is always the original
> problem.**

Challenge generation is only the last stage of the pipeline:

```
Dense Problem
     │
     ▼
Concept Extraction
     │
     ▼
Prerequisite Discovery
     │
     ▼
Dependency Graph
     │
     ▼
Learning Objectives
     │
     ▼
Progressive Challenges
     │
     ▼
Reference Rust Solutions
     │
     ▼
Adaptive Curriculum
```

The output feeds `apps/www` running against `localhost` or Docker, in place of
the bundled demo pool (`@some-ui/content`'s `CHALLENGES`, a flat set of
standalone data structures with no curriculum behind it - see
`apps/www/src/lib/leetype-challenges`). Not used by the GitHub Pages build,
which always plays the bundled demo pool instead.

---

## Rust Only

Every exercise ships exactly one source file, in **Rust**. There is no
TypeScript, C++, or C output.

This is a narrowing from an earlier version of this template, which asked for
the same problem restated in four languages. That optimized for the wrong
thing: a curriculum's value is in the _ordering of ideas_, and four
translations of one idea is four times the text for none of the progression.
`Leetype` resolves whatever language the player last preferred down to one the
challenge actually carries, so a Rust-only corpus plays correctly with no
further wiring.

---

## Usage Example Header

```
Target problem: [the dense problem, e.g. "Implement a lock-free Treiber stack"
                 or "LeetCode 4003 - Minimum Cost Path with Alternating Directions III"]
Audience: [e.g. "intermediate Rust programmer"]
Maximum curriculum size: [e.g. 10 exercises]
T: [Apply Curriculum Decomposer v2.0]
```

The target problem may come from any domain where expertise is a graph of
prerequisite concepts - Rust systems programming, DSA, algorithms,
concurrency, parsers, compilers, networking, operating systems. The pipeline
does not change.

The generator produces:

1. One JSON array (`challenges.json`) following the schema below, ordered from
   first prerequisite to the original problem.
2. One Rust source file per challenge - a complete, compilable, idiomatic
   reference solution, not a stub. This is the text the player types verbatim.

---

## Method

### 1. Extract concepts

Read the target problem and list every concept a solver must already hold.
Include the ones nobody states out loud: the hidden assumptions, and the
places beginners reliably get stuck.

### 2. Discover prerequisites, recursively

For each concept, ask what it presupposes. Keep going until you reach things
the stated audience already knows. That boundary is where the curriculum
starts.

### 3. Build the dependency graph

Write the graph out before writing any exercise. For "LeetCode 4003 - Minimum
Cost Path with Alternating Directions III", it might look like:

```
Original Problem
│
├── Weighted graphs
│
├── Shortest paths
│   ├── BFS
│   ├── Dijkstra
│   └── Priority queues
│
├── State augmentation
│   ├── Distinguish node vs state
│   ├── Encode extra state
│   └── Visited[state][vertex]
│
├── Alternating constraints
│   ├── State machine
│   ├── Parity
│   └── Previous direction
│
├── Dynamic programming intuition
│
└── Complexity analysis
```

### 4. Linearize it

Flatten the graph into a sequence where every node comes after everything it
depends on. That sequence is the curriculum:

```
1. Implement a binary heap.
2. Use the heap to implement Dijkstra.
3. Add a parity bit to graph state.
4. Modify Dijkstra to support multiple states per node.
5. Model alternating constraints with a finite state machine.
6. Solve a simplified alternating-edge graph.
7. Solve the original problem.
```

The same treatment of a Rust systems topic - "implement a lock-free Treiber
stack" - yields:

```
1. Ownership review
2. Moving values between functions
3. Generic structs
4. Option<T>
5. Linked lists with Box
6. Shared ownership
7. AtomicPtr basics
8. Compare-and-swap
9. Push operation
10. Complete Treiber stack
```

Notice what each of those lists has in common: **every exercise removes
exactly one source of cognitive load**, and the learner is never solving a toy
problem for its own sake. Each one answers "why am I learning this?" with
_because the next exercise literally requires it_.

### 5. Emit one challenge per node

One graph node, one exercise, one JSON entry, one Rust file. The last entry is
always the original problem.

---

## Output Destination

Write the manifest to:

```
packages/some-content/public/leetype/challenges.json
```

Write each challenge's Rust file under the same root:

```
packages/some-content/public/leetype/samples/<challenge-id>.rs
```

`codePaths.rust` in the manifest must point at these with a leading slash,
e.g. `"/leetype/samples/treiber-08-cas.rs"` - **not** `/code-samples/...`
(that's the small, committed demo set that ships on GitHub Pages; this corpus
is a separate, wholly local override).

This whole `packages/some-content/public/leetype/` tree is gitignored
(`packages/**/public` in the repo root's `.gitignore`) - it is expected to be
regenerated locally, never committed. Overwrite the manifest and any
regenerated sample files each time; there is currently one active curriculum,
not one per topic.

---

## Schema

`challenges.json` is a JSON array of these, with **at least one entry**:

```ts
{
  id: string          // stable slug, kebab-case ASCII, unique within the file
  title: string       // the exercise's name, e.g. "Compare-and-swap"
  description: string  // one or two sentences: what to implement here, and its constraints
  difficulty: "easy" | "medium" | "hard"
  mode: "data-structure" | "algorithm"
  tags: string[]       // free-form, e.g. ["rust", "concurrency", "lock-free"]
  codePaths: {
    rust: string       // required - the only language emitted
  }
  levelRequired: number  // player level gate (see @some-ui/leetype's PlayerProgress) - 1 unless the caller specifies otherwise
  curriculum: {
    stage: "remember" | "understand" | "apply" | "analyze" | "integrate" | "master"
    step: number                 // 1-based position in the linearized curriculum
    totalSteps: number           // length of the whole curriculum, identical on every entry
    insight: string              // ONE sentence: what single insight does this exercise give?
    learningObjectives: string[] // observable, code-level capabilities
    conceptsIntroduced: string[] // new here - ideally exactly one
    conceptsReinforced: string[] // carried forward from earlier exercises
    dependsOn: string[]          // ids of earlier challenges this one assumes
    completionCriteria: string[] // how the learner knows they are done
    targetProblem: string        // the dense problem the whole curriculum culminates in
  }
}
```

`curriculum` is technically optional in the loader's schema (so a corpus
generated before it existed keeps working), but **a corpus generated today must
include it on every entry**. Without it the UI presents the pool as a flat set
of standalone problems, which discards the entire decomposition.

### How the UI reads these fields

Worth knowing, because it determines what "good content" means here:

- `stage` + `step`/`totalSteps` render as the player's position on the ladder,
  both in the challenge picker (as stage-grouped rungs on a rail) and in the
  session's identity strip. A `stage` inconsistent with `step` order makes the
  ladder read as scrambled.
- `insight` is the **preview text in the picker** and the lead of the info
  panel. It is what a player reads to decide what they're about to learn, so
  it must be a claim about understanding, not a restatement of the title.
- `targetProblem` is repeated on every entry and rendered once, as the
  destination banner above the ladder. Keep it byte-identical across the whole
  curriculum.
- `conceptsIntroduced` renders highlighted; `conceptsReinforced` renders muted.
  Short noun phrases, ideally the same string wherever the same concept
  appears, so a reader can track one concept down the ladder.
- `dependsOn` renders as "Builds on". Use real challenge ids from the same
  file, never prose.

---

## Stages

The ladder, in order:

| stage        | The learner is...                                     |
| ------------ | ----------------------------------------------------- |
| `remember`   | getting the shape of the syntax into their fingers    |
| `understand` | seeing why the construct behaves the way it does      |
| `apply`      | using it deliberately, on a problem that needs it     |
| `analyze`    | taking it apart - what breaks, what it costs, why     |
| `integrate`  | combining it with everything earlier on the ladder    |
| `master`     | solving the original problem, now that nothing is new |

**Exactly one entry per curriculum carries `master`, and it is the last one.**
`master` is not a difficulty rating - it is the position of the original dense
problem.

---

## Decomposition Rules

When splitting a difficult topic, prefer introducing:

- syntax before abstractions
- ownership before borrowing
- borrowing before lifetimes
- lifetimes before unsafe
- safe APIs before unsafe implementations
- sequential algorithms before concurrent ones
- concrete types before generics
- generics before traits
- traits before associated types
- associated types before GATs

Never introduce multiple unrelated concepts in the same exercise unless one
genuinely cannot be understood without the other.

The learner must never encounter a concept before the curriculum has
introduced it. If exercise 7 uses `Arc` and no earlier exercise introduced it,
the decomposition is wrong - not merely incomplete.

---

## Learning Objectives Must Be Observable

Each exercise isolates **one measurable skill**, so that a future adaptive
layer can tell which specific node a learner failed at.

Good:

- implement `Option::take`
- write an iterator
- use `Rc`
- use `Arc`
- write a recursive tree traversal
- implement binary search

Poor:

- "learn ownership"
- "practice Rust"
- "get comfortable with concurrency"

Every objective must be checkable by looking at code.

This is also what makes remediation possible later. If a learner fails
exercise 4 three times, the engine can walk `dependsOn` and
`conceptsIntroduced`:

```
Challenge 4
│
├── Priority Queue    ✓
├── Dijkstra          ✓
├── State Encoding    ✗
└── Visited States    ✗
```

and synthesize exercises targeting only the missing nodes before retrying.
That only works if each node's concepts are named precisely and consistently.

---

## Rust Source Requirements

Every challenge includes exactly one Rust file. It must be:

- complete
- idiomatic
- compilable
- rustfmt style
- standard library only (no external crates)
- free of placeholders, TODOs, `unimplemented!()`, and stub bodies
- focused on this exercise's learning objective, with no abstraction that
  distracts from the concept being taught

The typing game replays this text character-for-character, so an incomplete
solution reads to the player as intentional (and untypeable) filler. Rust is
displayed as authored - `Leetype` re-runs Prettier over TypeScript/C++ at load
time, but never over Rust (see `PRETTIER_PARSER_MAP` in
`packages/ui/leetype/src/components/typing-game/leetype/index.tsx`) - so the
file's formatting is exactly what the player sees and types.

---

## Curriculum Philosophy

The learner is not memorizing solutions. They are constructing a mental model.

Every exercise must answer:

> **What single insight does the learner gain from this exercise?**

If that cannot be answered in one sentence, the exercise is too broad and must
be split. That is why `insight` is a required field rather than a nice-to-have:
it is the constraint, enforced by having to write it down.

---

## Worked Example

```json
{
  "id": "treiber-08-cas",
  "title": "Compare-and-swap",
  "description": "Increment a shared counter using only `compare_exchange` in a retry loop.",
  "difficulty": "hard",
  "mode": "algorithm",
  "tags": ["rust", "concurrency", "atomics"],
  "codePaths": {
    "rust": "/leetype/samples/treiber-08-cas.rs"
  },
  "levelRequired": 1,
  "curriculum": {
    "stage": "analyze",
    "step": 8,
    "totalSteps": 10,
    "insight": "CAS turns 'read then write' into one step that can fail and retry.",
    "learningObjectives": [
      "Write a CAS loop that re-reads the current value on failure",
      "Say what a spurious failure is and why the loop tolerates it"
    ],
    "conceptsIntroduced": ["compare_exchange", "retry loops", "ABA hazard"],
    "conceptsReinforced": ["AtomicPtr", "Ordering"],
    "dependsOn": ["treiber-07-atomic-ptr"],
    "completionCriteria": [
      "Two threads incrementing 10_000 times each end at 20_000"
    ],
    "targetProblem": "Implement a lock-free Treiber stack with AtomicPtr and CAS."
  }
}
```

paired with one file at
`packages/some-content/public/leetype/samples/treiber-08-cas.rs`, containing a
complete, compilable CAS-loop counter.

A fuller ten-entry example of this exact shape lives in the repo as Storybook
data: `packages/ui/leetype/src/lib/leetype/story-fixtures/index.ts`. Read it
if any of the above is ambiguous - it is the same Treiber decomposition, all
ten rungs.

---

## Success Criteria

A curriculum is correct only if **all** of the following hold:

- [ ] Every exercise introduces at most one major new concept
- [ ] Each exercise builds directly on earlier exercises
- [ ] No prerequisite appears after the exercise that needs it
- [ ] The learner can tell, from `insight` alone, why each exercise exists
- [ ] The final exercise is the original target problem, at `stage: "master"`
- [ ] Removing any exercise would make a later transition meaningfully harder

---

## Self-Check Before Returning the File

- [ ] Every `id` is unique within the array
- [ ] `codePaths` has a `rust` entry, a non-empty `/leetype/samples/....rs`
      path (not `/code-samples/...`), and no other language
- [ ] Every referenced `.rs` file is actually being written out, and is a
      complete, idiomatic, standard-library-only solution - not a stub
- [ ] `difficulty` is one of `easy`/`medium`/`hard`; `mode` is one of
      `data-structure`/`algorithm`; `stage` is one of the six listed above
- [ ] `step` runs 1..N with no gaps and no repeats, and `totalSteps` equals N
      on every entry
- [ ] Exactly one entry has `stage: "master"`, and it is `step: N`
- [ ] `targetProblem` is byte-identical on every entry
- [ ] Every `dependsOn` id exists in this file and has a strictly lower `step`
- [ ] Every `insight` is one sentence and says something the `title` does not
- [ ] Every concept named in `conceptsReinforced` appears in some earlier
      entry's `conceptsIntroduced`
- [ ] Output is a bare JSON array - no comments, no trailing commas, no
      surrounding prose

---

## After Generating

- **Docker** (`docker compose up www`): picked up automatically, nothing to
  run - `infra/compose/www.yml` volume-mounts
  `packages/some-content/public/leetype` straight through.
- **`vite dev` (no Docker)**: run `pnpm run content:link` once (from
  `apps/www`) to symlink `packages/some-content/public/leetype` into
  `apps/www/public/leetype`.
- Either way, a **full browser reload** (not just an in-app navigation) is
  needed to see a freshly regenerated corpus - the query client caches a
  successful fetch for a while and won't refetch on remount.
- If nothing shows up, open devtools: a 404 falls back to the bundled demo
  pool silently (expected before you've generated anything); anything else -
  most often a schema mismatch, and most often in `curriculum` - logs a
  `[leetype-challenges]` console warning.
