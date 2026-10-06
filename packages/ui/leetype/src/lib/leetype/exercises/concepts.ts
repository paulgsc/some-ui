/**
 * Stable concept identity (LTY-SEAM S5): one module-local list, so a typo in
 * a concept reference is a compile error instead of a new concept.
 *
 * `Step.concepts` stays "a bag of strings nothing branches on"; this adds no
 * structure, only one place to rename when a real concept space (O1,
 * `adaptive-learning-canon.typ`) maps onto them. Identity derived from
 * scattered inline literals orphans on the next revision (Thm. 1.1).
 *
 * # The granularity rule
 *
 * A concept id names **the abstraction being probed, not the API used to
 * probe it**: `two-ended-convergence`, not `Vec::swap`. An API name is a
 * *bridge* target (LTY-ROUTE): a bridge answers "how do I do this in Rust",
 * a concept "what idea is this step exercising". So `Entry API` is
 * `lookupAsPlace`, and `Entry::or_insert(_with)` maps to
 * `eagerVsLazyEvaluation` or `singleLookupMutation` depending on what the
 * step actually probes.
 *
 * # What this is not
 *
 * Not the concept space (O1, `adaptive-learning-canon.typ` §11): flat, with
 * no edges, ordering or versioning on purpose, and no claim to completeness.
 * Nothing renders a concept id: they are kebab-case, meant to be diffed and
 * grepped, and never derived from a step's heading, goal or title
 * (Thm. 1.1).
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
  subsequenceFeasibility: "subsequence-feasibility",
  lexicographicGreedyChoice: "lexicographic-greedy-choice",
  suffixCertificate: "suffix-certificate",
  oneMismatchBudget: "one-mismatch-budget",
  greedyExchangeArgument: "greedy-exchange-argument",
  strictIndexOrdering: "strict-index-ordering",
  impossibilityDetection: "impossibility-detection",
  linearTimeScan: "linear-time-scan",
  /** Marks a step as shell-stress fixture data, never a taught abstraction — see `seed/fixtures.ts`'s `adversarial`/`HOSTILE_PROMPT_STEP`. */
  fixture: "fixture",
} as const
