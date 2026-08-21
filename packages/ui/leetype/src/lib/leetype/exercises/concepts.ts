/**
 * Stable concept identity (LTY-SEAM S5, #1019) — one module-local list, so a
 * typo in a concept reference is a compile error instead of a new concept.
 *
 * # Why this exists
 *
 * `Step.concepts` (`types/exercise.ts`) is deliberately "a bag of strings
 * nothing branches on" — the honest shape for the place a concept graph
 * will eventually attach, and inventing more structure than that now would
 * be inventing the judgment M20 defers. This module does not add structure
 * to that bag. It makes the strings *cheap to migrate* when a real concept
 * space (O1, `adaptive-learning-canon.typ`) eventually needs to map onto
 * them: one place to rename instead of a hand grep across a corpus that has
 * grown, per Theorem 1.1 — identity derived from a scattered surface (here,
 * inline string literals repeated across steps) orphans on the next
 * revision.
 *
 * # The granularity rule
 *
 * A concept id names **the abstraction being probed, not the API used to
 * probe it**. `two-ended-convergence`, not `Vec::swap`. An API name is a
 * *bridge* target (#1014, LTY-ROUTE), not a concept — a bridge answers "how
 * do I do this in Rust", a concept answers "what idea is this step
 * exercising". Applying that line to the strings this corpus shipped with
 * (LTY-FAMILIES #1007/#1008) moved a few of them:
 *
 * - `"std::collections"` dropped: a module path, not an abstraction: the
 *   step's only concept is that a `use` declaration brings a type into
 *   scope, already named by `useDeclarations`.
 * - `"Entry API"` became {@link CONCEPT_IDS.lookupAsPlace}: the transferable
 *   idea is *holding a lookup result as a place you can act on rather than
 *   a value*, which the Entry API happens to be Rust's spelling of.
 * - `"Entry::or_insert_with"` and `"Entry::or_insert"` collapsed into
 *   {@link CONCEPT_IDS.eagerVsLazyEvaluation} wherever that was the actual
 *   dimension being probed (whether the default is worth deferring), and
 *   into {@link CONCEPT_IDS.singleLookupMutation} where the point was
 *   avoiding a second hash lookup instead — the same two API names were
 *   standing in for two different abstractions depending on the step, which
 *   is exactly the kind of collision Theorem 1.1 predicts for surface-
 *   derived identity.
 * - `"Entry::or_default"` dropped from `entry-08-generalize`: the step
 *   already names the abstraction it probes (`generics`, `traitBounds`);
 *   the trait method used to reach it doesn't need its own concept.
 *
 * # What this is not
 *
 * Not the concept space. **O1** is a shipped, versioned artifact per
 * subject matter with a prerequisite relation and a confusion relation, and
 * it is explicitly the first obligation of `adaptive-learning-canon.typ`
 * §11 — not this milestone's. This list is flat, carries no edges, no
 * ordering, and no versioning, on purpose: adding a `dependsOn` here would
 * be reintroducing the exact field `types/exercise.ts` already deleted from
 * `Challenge`, for the same reason — order is a claim nobody has made yet,
 * and a graph with one always-satisfied node is not a graph, it is a list
 * pretending to be one. It makes no claim to completeness or to
 * partitioning the domain either: it is a vocabulary the shipped corpus
 * happens to use today, not an inventory of every concept LeetType could
 * ever probe.
 *
 * Nothing renders a concept id. They exist to be diffed and grepped, never
 * displayed — kebab-case, and never derived from a step's heading, goal, or
 * title, which is exactly the derivation Theorem 1.1 warns orphans on the
 * next content revision.
 */
export const CONCEPT_IDS = {
  useDeclarations: "use-declarations",
  mutability: "mutability",
  typeInference: "type-inference",
  lookupAsPlace: "lookup-as-place",
  borrowing: "borrowing",
  singleLookupMutation: "single-lookup-mutation",
  closures: "closures",
  mutableReferences: "mutable-references",
  methodChaining: "method-chaining",
  expressionOrientedStyle: "expression-oriented-style",
  eagerVsLazyEvaluation: "eager-vs-lazy-evaluation",
  inPlaceMutation: "in-place-mutation",
  generics: "generics",
  traitBounds: "trait-bounds",
  doubleLookup: "double-lookup",
  amortizedHashing: "amortized-hashing",
  loopProgress: "loop-progress",
  mutableState: "mutable-state",
  exclusiveVsInclusiveBounds: "exclusive-vs-inclusive-bounds",
  sliceIndexing: "slice-indexing",
  windowShrinking: "window-shrinking",
  preconditionGuard: "precondition-guard",
  memoization: "memoization",
  /** Marks a step as shell-stress fixture data, never a taught abstraction — see `seed/fixtures.ts`'s `adversarial`/`HOSTILE_PROMPT_STEP`. */
  fixture: "fixture",
} as const
