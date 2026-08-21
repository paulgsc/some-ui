import { CONCEPT_IDS } from "@leetype/lib/leetype/exercises/concepts"
import type {
  ConstructionStep,
  DiagnosticStep,
  Exercise,
} from "@leetype/types/exercise"

/**
 * Failure class 4: the double lookup — deliberately the same subject
 * matter as `entryApi` below, in diagnostic form. Folded into `entryApi`'s
 * tail (LTY-FAMILIES A4) rather than kept as a freestanding exercise.
 *
 * Defined ahead of `entryApi`: `const` bindings are not hoisted, and this
 * step's value is spread into `entryApi.steps` below under a renamed id.
 */
const diagnosticDoubleLookupStep: DiagnosticStep = {
  id: "diagnostic-double-lookup-01",
  goal: "Replace the naive check-then-fetch with the single-lookup Entry call.",
  concepts: [
    CONCEPT_IDS.singleLookupMutation,
    CONCEPT_IDS.doubleLookup,
    CONCEPT_IDS.amortizedHashing,
  ],
  // LTY-SEAM S3 (#1017): entry-04-fill constructs single-lookup mutation
  // via Entry; this diagnostic probes recognition of the same idea from
  // its failure mode — repairing a naive check-then-fetch back into it.
  // Renamed to entry-09-diagnostic-double-lookup below (LTY-FAMILIES A4),
  // and this field travels with it.
  transferFrom: "entry-04-fill",
  blocks: [
    {
      kind: "trace",
      headline: "REGRESSION",
      observations: [
        { label: "hash ops", value: "2n" },
        { label: "target", value: "n" },
      ],
    },
    {
      kind: "typing",
      source:
        "‹fn insert(map: &mut HashMap<Key, Vec<Value>>, key: Key, value: Value) {\n    // naive: contains_key then get_mut/insert — two hash lookups per call\n    ›map.entry(key).or_default().push(value);‹\n}›",
      language: "rust",
    },
  ],
  rationale: {
    cause:
      "contains_key plus a branch to insert or get_mut hashes the key twice on every call, once to ask and once to answer",
    whyRepairDiscriminates:
      "entry(key) performs the one lookup the naive version repeats, and or_default().push chains directly onto the place it returns without a second lookup",
  },
}

/**
 * Failure class 5: eager vs. lazy default construction — the same subject
 * matter as `entryApi`'s fill commitment, in diagnostic form. Folded into
 * `entryApi`'s tail below, same as failure class 4 above.
 */
const diagnosticEagerLazyDefaultStep: DiagnosticStep = {
  id: "diagnostic-eager-lazy-default-01",
  goal: "Make the default lazy, so the constructor runs only on the call that needs it.",
  concepts: [CONCEPT_IDS.eagerVsLazyEvaluation],
  blocks: [
    {
      kind: "trace",
      headline: "REGRESSION",
      observations: [
        { label: "constructor calls", value: "1000" },
        { label: "target", value: "1" },
      ],
    },
    {
      kind: "typing",
      source:
        "‹let mut map: HashMap<Key, Vec<u8>> = HashMap::new();\nfor _ in 0..1000 {\n    // eager: or_insert(build_default()) runs the constructor on every call,\n    // even the 999 that find the key already occupied\n    map.entry(key).›or_insert_with(build_default)‹;\n}›",
      language: "rust",
    },
  ],
  rationale: {
    cause:
      "or_insert evaluates its argument eagerly, so build_default() runs on every call regardless of whether the entry is vacant",
    whyRepairDiscriminates:
      "or_insert_with takes a closure, so build_default only runs on the one call that finds the entry actually vacant",
  },
}

/**
 * The motivation's own example, as a chain of commitments (LTY-FAMILIES A4).
 *
 * The corpus's flagship, and the clearest surviving instance of the shape
 * this milestone retired: eight steps of *explain, then reproduce what was
 * explained*, prose doing the conceptual work before the engine ever saw a
 * keystroke. Rewritten in place — same id, so the diff is the argument —
 * with the exposition deleted rather than shortened. No `PromptBlock` here
 * carries conceptual exposition; every claim that used to live in prose now
 * lives in a rendered evidence block (what follows, not why) or in an
 * `obligation` field the player never sees at all.
 *
 * The line the whole exercise still builds toward is
 * `map.entry(key).or_insert_with(Vec::new).push(value);`. Each commitment's
 * frame re-shows every prior commitment as `‹context›` and anchors the new
 * witness inside it — not because anything is buggy (that is the diagnostic
 * family's use of the same mechanism), but because "what has already been
 * established" is exactly what LTY-FRAME's context role was built to carry.
 *
 * Step ids stay `entry-NN-slug` throughout, tail included: the shim's own
 * test (`../../index.test.ts`) treats id order as the ladder's order, and a
 * folded-in diagnostic step keeping its freestanding `diagnostic-*` id
 * would sort before every `entry-*` id and break that invariant. Renaming
 * at the point of use is cheap; the original id is still findable in this
 * file, on `diagnosticDoubleLookupStep`/`diagnosticEagerLazyDefaultStep`
 * above.
 *
 * Step-length variance is preserved on purpose — `entry-01`/`entry-02` and
 * the individual commitments run under 40 characters typed, `entry-08`'s
 * generalized function runs well past 120 — because a rewrite that quietly
 * narrowed what the shell is tested against would be a regression dressed
 * as a refactor.
 */
export const entryApi: Exercise = {
  id: "rust-hashmap-entry",
  title: "The Entry API",
  steps: [
    {
      id: "entry-01-import",
      goal: "Bring HashMap into scope.",
      concepts: [CONCEPT_IDS.useDeclarations],
      blocks: [
        {
          kind: "typing",
          source: "use std::collections::HashMap;",
          language: "rust",
        },
      ],
    },
    {
      id: "entry-02-empty-map",
      goal: "Create an empty map you are allowed to change.",
      concepts: [CONCEPT_IDS.mutability, CONCEPT_IDS.typeInference],
      blocks: [
        {
          kind: "typing",
          source: "let mut map = HashMap::new();",
          language: "rust",
        },
      ],
    },
    {
      id: "entry-03-place",
      goal: "Ask the map for the place a key lives, not its value.",
      concepts: [CONCEPT_IDS.lookupAsPlace, CONCEPT_IDS.borrowing],
      obligation: "a lookup can be held as a place, not a value",
      blocks: [
        {
          kind: "transition",
          label: "slot",
          before: "unresolved",
          after: "vacant | occupied",
        },
        {
          // LTY-PATCH P5 (#1080): the first hunk in an accumulating chain
          // — no prior commitment to carry as context yet, so the whole
          // rendered line is `add`. Steps 04 and 05 below re-show this
          // exact line as context and extend it, the construction
          // family's own reading of the diagnostic mapping (docs/leetype/
          // README.md's LTY-PATCH section).
          kind: "typing",
          source: "‹let slot = ›map.entry(key)‹;›",
          language: "rust",
          patch: {
            path: "src/entry.rs",
            oldStart: 1,
            newStart: 1,
            lineKinds: ["add"],
          },
        },
      ],
    } satisfies ConstructionStep,
    {
      id: "entry-04-fill",
      goal: "Fill the place without hashing the key a second time.",
      concepts: [CONCEPT_IDS.singleLookupMutation, CONCEPT_IDS.closures],
      obligation: "a vacant place can be filled without a second lookup",
      blocks: [
        {
          kind: "trace",
          headline: "hash ops",
          observations: [{ label: "entry + fill", value: "1" }],
        },
        {
          // entry-03-place's whole line returns here as context (line 0),
          // unaltered — the accumulation is not new authoring, it is what
          // the source already did before this story painted it as a diff.
          kind: "typing",
          source:
            "‹let slot = map.entry(key);\nlet filled = slot›.or_insert_with(Vec::new)‹;›",
          language: "rust",
          patch: {
            path: "src/entry.rs",
            oldStart: 1,
            newStart: 1,
            lineKinds: ["context", "add"],
          },
        },
      ],
    } satisfies ConstructionStep,
    {
      id: "entry-05-mutate",
      goal: "Push onto the vector the filled place actually holds.",
      concepts: [CONCEPT_IDS.mutableReferences, CONCEPT_IDS.methodChaining],
      obligation: "the filled place yields a mutable borrow, not a copy",
      blocks: [
        {
          kind: "transition",
          label: "filled",
          before: "Entry<K, Vec<V>>",
          after: "&mut Vec<V>",
        },
        {
          // Both prior lines return as context; only the final witness is
          // typed — the chain's third and last hunk.
          kind: "typing",
          source:
            "‹let slot = map.entry(key);\nlet filled = slot.or_insert_with(Vec::new);\nfilled›.push(value)‹;›",
          language: "rust",
          patch: {
            path: "src/entry.rs",
            oldStart: 1,
            newStart: 1,
            lineKinds: ["context", "context", "add"],
          },
        },
      ],
    } satisfies ConstructionStep,
    {
      id: "entry-06-compose",
      goal: "Chain the three commitments into the one line they were always building toward.",
      concepts: [
        CONCEPT_IDS.methodChaining,
        CONCEPT_IDS.expressionOrientedStyle,
      ],
      obligation:
        "the three commitments compose into one expression, with no named intermediate for the place or the filled result",
      blocks: [
        {
          kind: "transition",
          label: "bindings",
          before: "2 (slot, filled)",
          after: "0",
        },
        {
          kind: "typing",
          source: "map.entry(key).or_insert_with(Vec::new).push(value);",
          language: "rust",
        },
      ],
    } satisfies ConstructionStep,
    {
      id: "entry-07-transfer",
      goal: "Apply the same shape to counting, where the default is already a value, not a computation.",
      concepts: [
        CONCEPT_IDS.lookupAsPlace,
        CONCEPT_IDS.eagerVsLazyEvaluation,
        CONCEPT_IDS.inPlaceMutation,
      ],
      // LTY-SEAM S3 (#1017): entry-03-place introduces lookupAsPlace —
      // holding a lookup as a place rather than a value. This step is the
      // corpus's own "transfer" (it says so in its id): recognizing the
      // same abstraction applies to a structurally different value type.
      transferFrom: "entry-03-place",
      obligation:
        "the commit-fill-mutate shape transfers to counting, where or_insert is the right call because there is nothing to defer — 0 is a literal, not a closure's worth of work",
      blocks: [
        {
          kind: "transition",
          label: "default",
          before: "or_insert_with(Vec::new) — a fn pointer, deferred",
          after: "or_insert(0) — a literal, nothing to defer",
        },
        {
          kind: "typing",
          source: "*counts.entry(word).or_insert(0) += 1;",
          language: "rust",
        },
      ],
    } satisfies ConstructionStep,
    {
      id: "entry-08-generalize",
      goal: "Fold the shape into a function that groups any pairs by key.",
      concepts: [CONCEPT_IDS.generics, CONCEPT_IDS.traitBounds],
      obligation:
        "the shape holds for any key and value type, not just this one map",
      blocks: [
        {
          kind: "transition",
          label: "scope",
          before: "one map, one key",
          after: "any K, V — over every pair",
        },
        {
          kind: "typing",
          source:
            "fn group<K: Eq + Hash, V>(pairs: Vec<(K, V)>) -> HashMap<K, Vec<V>> {\n    let mut out = HashMap::new();\n    for (key, value) in pairs {\n        out.entry(key).or_default().push(value);\n    }\n    out\n}",
          language: "rust",
        },
      ],
      provenance: {
        source: "The pattern this exercise was distilled from",
        locator: "std::collections::hash_map::Entry",
      },
    } satisfies ConstructionStep,
    // The diagnostic handoff (LTY-FAMILIES A4): construction creates the
    // available forms, diagnosis makes their causal boundaries visible.
    // Renamed from their freestanding ids (still findable above) so the
    // exercise's step order and its ids' sort order keep agreeing.
    { ...diagnosticDoubleLookupStep, id: "entry-09-diagnostic-double-lookup" },
    {
      ...diagnosticEagerLazyDefaultStep,
      id: "entry-10-diagnostic-eager-lazy-default",
    },
  ],
}
