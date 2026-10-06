import { CONCEPT_IDS } from "@leetype/lib/leetype/exercises/concepts"
import type { DiagnosticStep, Exercise } from "@leetype/types/exercise"
import { typingBlockFromDiff } from "@leetype/types/exercise"

import { withJudgment } from "./judgment-step"

/**
 * Failure class 4: the double lookup, `entryApi`'s subject in diagnostic
 * form, folded into `entryApi`'s tail.
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
  // LTY-SEAM S3: entry-04-fill constructs single-lookup mutation; this
  // probes the same idea from its failure mode. Renamed to
  // entry-09-diagnostic-double-lookup below, with this field.
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
 * No `PromptBlock` carries conceptual exposition: every claim lives in a
 * rendered evidence block (what follows, not why) or in an unrendered
 * `obligation`.
 *
 * It builds toward `map.entry(key).or_insert_with(Vec::new).push(value);`.
 * Each commitment's frame re-shows the prior ones as `‹context›` with the
 * new witness inside: "what has already been established" is what
 * LTY-FRAME's context role carries.
 *
 * Step ids stay `entry-NN-slug`, tail included: the shim's test treats id
 * order as the ladder's order, so the folded-in diagnostic steps are renamed
 * at the point of use (originals: `diagnosticDoubleLookupStep`,
 * `diagnosticEagerLazyDefaultStep` above).
 *
 * Step lengths vary on purpose (under 40 typed characters up to `entry-08`'s
 * well past 120), so the shell stays tested against both.
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
    withJudgment({
      id: "entry-03-place",
      goal: "Ask the map for the place a key lives, not its value.",
      concepts: [CONCEPT_IDS.lookupAsPlace, CONCEPT_IDS.borrowing],
      obligation: "a lookup can be held as a place, not a value",
      decisionReason:
        "entry(key) defers the vacant-or-occupied decision to whichever call fills or mutates the place, so nothing has to re-derive presence from a second lookup",
      surfaceRule: "use Entry because that's the idiomatic HashMap call",
      counterfactual:
        "the caller only ever tests whether the key exists and never fills or mutates it",
      blocks: [
        {
          kind: "transition",
          label: "slot",
          before: "unresolved",
          after: "vacant | occupied",
        },
        // The first hunk of an accumulating chain: all `add`. Steps 04 and
        // 05 re-show this line as context and extend it (LTY-PATCH).
        typingBlockFromDiff({
          language: "rust",
          path: "src/entry.rs",
          oldStart: 1,
          newStart: 1,
          segments: [
            { kind: "context", text: "let slot = " },
            { kind: "addition", text: "map.entry(key)" },
            { kind: "context", text: ";" },
          ],
        }),
      ],
    }),
    withJudgment({
      id: "entry-04-fill",
      goal: "Fill the place without hashing the key a second time.",
      concepts: [CONCEPT_IDS.singleLookupMutation, CONCEPT_IDS.closures],
      obligation: "a vacant place can be filled without a second lookup",
      decisionReason:
        "or_insert_with resolves the vacant-or-occupied branch through the one lookup entry(key) already performed, instead of asking the map a second time",
      surfaceRule:
        "or_insert_with is the entry-API method for filling a default",
      counterfactual:
        "the default's construction were fallible and needed to propagate an error with ?, which or_insert_with's closure cannot do since it must be infallible",
      blocks: [
        {
          kind: "trace",
          headline: "hash ops",
          observations: [{ label: "entry + fill", value: "1" }],
        },
        // entry-03-place's whole line returns as context (line 0).
        typingBlockFromDiff({
          language: "rust",
          path: "src/entry.rs",
          oldStart: 1,
          newStart: 1,
          segments: [
            {
              kind: "context",
              text: "let slot = map.entry(key);\nlet filled = slot",
            },
            { kind: "addition", text: ".or_insert_with(Vec::new)" },
            { kind: "context", text: ";" },
          ],
        }),
      ],
    }),
    withJudgment({
      id: "entry-05-mutate",
      goal: "Push onto the vector the filled place actually holds.",
      concepts: [CONCEPT_IDS.mutableReferences, CONCEPT_IDS.methodChaining],
      obligation: "the filled place yields a mutable borrow, not a copy",
      decisionReason:
        "pushing through the &mut Vec<V> or_insert_with already returned avoids a second hashed lookup to reach the same vector",
      surfaceRule: "call push because Vec supports pushing",
      counterfactual:
        "the fill and the mutate happened across a boundary the borrow cannot cross (an async yield point, a callback run later), so the vector has to be re-looked-up by key at that point instead",
      blocks: [
        {
          kind: "transition",
          label: "filled",
          before: "Entry<K, Vec<V>>",
          after: "&mut Vec<V>",
        },
        // Both prior lines return as context; only the final witness is
        // typed — the chain's third and last hunk.
        typingBlockFromDiff({
          language: "rust",
          path: "src/entry.rs",
          oldStart: 1,
          newStart: 1,
          segments: [
            {
              kind: "context",
              text: "let slot = map.entry(key);\nlet filled = slot.or_insert_with(Vec::new);\nfilled",
            },
            { kind: "addition", text: ".push(value)" },
            { kind: "context", text: ";" },
          ],
        }),
      ],
    }),
    withJudgment({
      id: "entry-06-compose",
      goal: "Chain the three commitments into the one line they were always building toward.",
      concepts: [
        CONCEPT_IDS.methodChaining,
        CONCEPT_IDS.expressionOrientedStyle,
      ],
      obligation:
        "the three commitments compose into one expression, with no named intermediate for the place or the filled result",
      decisionReason:
        "slot and filled are each read exactly once, immediately after being bound, so naming them buys no reuse and no observation point a reader needs",
      surfaceRule: "chain calls together because method chaining is idiomatic",
      counterfactual:
        "the code needed to branch on whether the entry was already occupied before deciding how to fill it, which needs slot bound long enough to match on Entry::Vacant/Entry::Occupied",
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
    }),
    withJudgment({
      id: "entry-07-transfer",
      goal: "Apply the same shape to counting, where the default is already a value, not a computation.",
      concepts: [
        CONCEPT_IDS.lookupAsPlace,
        CONCEPT_IDS.eagerVsLazyEvaluation,
        CONCEPT_IDS.inPlaceMutation,
      ],
      // LTY-SEAM S3: entry-03-place introduces lookupAsPlace; this step
      // transfers it to a structurally different value type.
      transferFrom: "entry-03-place",
      obligation:
        "the commit-fill-mutate shape transfers to counting, where or_insert is the right call because there is nothing to defer — 0 is a literal, not a closure's worth of work",
      decisionReason:
        "0 is already a fully-evaluated literal, so or_insert has nothing to defer and or_insert_with would only wrap it in a closure that runs once regardless",
      surfaceRule:
        "use or_insert_with because deferred construction is generally safer",
      counterfactual:
        "the default were an expensive constructor instead of a literal — exactly entry-04's case, where deferring it until the entry is vacant is why or_insert_with is owed there",
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
    }),
    withJudgment({
      id: "entry-08-generalize",
      goal: "Fold the shape into a function that groups any pairs by key.",
      concepts: [CONCEPT_IDS.generics, CONCEPT_IDS.traitBounds],
      obligation:
        "the shape holds for any key and value type, not just this one map",
      decisionReason:
        "the trait bounds Eq + Hash name exactly the operations the body performs on K, so the function serves every (K, V) pair the shape reaches without committing to a concrete one",
      surfaceRule: "make it generic because generics are more reusable",
      counterfactual:
        "this shape were only ever called with one concrete (K, V) pair and no second call site in sight — the concrete version needs no trait-bound machinery a reader has to resolve for a reuse that never happens",
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
    }),
    // The diagnostic tail: construction creates the forms, diagnosis shows
    // their causal boundaries. Renamed so id order matches step order.
    { ...diagnosticDoubleLookupStep, id: "entry-09-diagnostic-double-lookup" },
    {
      ...diagnosticEagerLazyDefaultStep,
      id: "entry-10-diagnostic-eager-lazy-default",
    },
  ],
}
