import type {
  ConstructionStep,
  DiagnosticStep,
  Exercise,
  Step,
} from "@leetype/types/exercise"

import { CONCEPT_IDS } from "./concepts"

/**
 * Hand-authored exercises. The whole corpus, for now.
 *
 * These are written by a person, on purpose. The interesting research
 * problem — infer the minimal competencies required to have written a piece
 * of software, then synthesize the smallest observable proof of each — is
 * explicitly deferred out of M20 (see `docs/leetype/README.md`). The
 * mechanical half has to be playable before there is anything to judge the
 * judgment against, and it can be made playable against exercises somebody
 * wrote down.
 *
 * Nothing outside `../shim` may import this file. See that module for why.
 */

/**
 * Five diagnostic instances (LTY-FAMILIES A3), hand-authored, chosen to
 * span the failure classes rather than the topics — the design
 * discussion's own recommendation, and the posture this file already
 * takes with `entryApi`: validate the interaction by hand before there is
 * anything to judge a generator's output against.
 *
 * Defined ahead of `entryApi` below: `diagnosticDoubleLookupStep` and
 * `diagnosticEagerLazyDefaultStep` are deliberately the same subject matter
 * as `entryApi`'s own motivation (the design discussion's instruction —
 * "the same subject matter as the existing Entry API exercise, in
 * diagnostic form"), and LTY-FAMILIES A4 folds both into `entryApi`'s tail
 * as the diagnostic handoff, under renamed ids that keep the exercise's
 * step ids sorting in play order (see `entryApi`'s own doc comment) —
 * `const` bindings are not hoisted, so the steps have to exist textually
 * before the exercise that spreads them.
 *
 * Every instance's frame uses LTY-FRAME's `‹context›` spans: the buggy
 * attempt is fully visible (rendered, never typed), with the one blank
 * that repairs it — anchored inside the frame, never floating beneath it,
 * per constraint 6. The `trace` block is the failure signal; `rationale`
 * is the authoring justification for constraints 1, 2, 3 and 5, checked
 * mechanically (not for quality) by LTY-FAMILIES A5's corpus lint.
 */

/** Failure class 1: a loop that never advances toward its own exit. */
const diagnosticLoopProgressStep: DiagnosticStep = {
  id: "diagnostic-loop-progress-01",
  goal: "Give the parse loop the missing step that lets it terminate.",
  concepts: [CONCEPT_IDS.loopProgress, CONCEPT_IDS.mutableState],
  blocks: [
    {
      kind: "trace",
      headline: "TIMEOUT",
      observations: [{ label: "cursor", value: "remained 0" }],
    },
    {
      kind: "typing",
      source:
        "‹while cursor < input.len() {\n    parse(input[cursor]);\n    ›cursor += 1;‹\n}›",
      language: "rust",
    },
  ],
  rationale: {
    cause:
      "the loop body never mutates cursor, so the while condition never becomes false",
    whyRepairDiscriminates:
      "incrementing cursor is the only change that gives the loop measurable progress toward input.len()",
  },
}

const diagnosticLoopProgress: Exercise = {
  id: "diagnostic-loop-progress",
  title: "Diagnostic: loop progress",
  steps: [diagnosticLoopProgressStep],
}

/** Failure class 2: an exclusive bound treated as if it were a valid index. */
const diagnosticInclusiveBoundaryStep: DiagnosticStep = {
  id: "diagnostic-inclusive-boundary-01",
  goal: "Fix the scan bound so the loop stops one before the slice ends, not at it.",
  concepts: [CONCEPT_IDS.exclusiveVsInclusiveBounds, CONCEPT_IDS.sliceIndexing],
  blocks: [
    {
      kind: "trace",
      headline: "PANIC",
      observations: [
        { label: "index", value: "4" },
        { label: "len", value: "4" },
      ],
    },
    {
      kind: "typing",
      source:
        "‹let (mut left, right) = (0, chars.len());\n// attempted: while left <= right — panics once left reaches right\nwhile ›left < right‹ {\n    sum += chars[left] as u32;\n    left += 1;\n}›",
      language: "rust",
    },
  ],
  rationale: {
    cause:
      "the loop condition treats right (an exclusive bound equal to chars.len()) as if it were a valid index, so the scan reads one position past the last element",
    whyRepairDiscriminates:
      "left < right is the only condition that excludes left == right, the exact point where chars[left] reads out of bounds",
  },
}

const diagnosticInclusiveBoundary: Exercise = {
  id: "diagnostic-inclusive-boundary",
  title: "Diagnostic: inclusive boundary",
  steps: [diagnosticInclusiveBoundaryStep],
}

/** Failure class 3: a search window whose edge never actually moves. */
const diagnosticShrinkingIntervalStep: DiagnosticStep = {
  id: "diagnostic-shrinking-interval-01",
  goal: "Give the shrinking search its missing step, so the window actually narrows.",
  concepts: [CONCEPT_IDS.loopProgress, CONCEPT_IDS.windowShrinking],
  blocks: [
    {
      kind: "trace",
      headline: "TIMEOUT",
      observations: [{ label: "right", value: "stayed at 4" }],
    },
    {
      kind: "typing",
      source:
        "‹let mut left = 0;\nlet mut right = chars.len();\nwhile left < right {\n    if chars[right - 1] == target {\n        break;\n    }\n    ›right -= 1;‹\n}›",
      language: "rust",
    },
  ],
  rationale: {
    cause:
      "nothing in the loop body decrements right, so the window's right edge never moves and left < right stays true forever when the target is never found",
    whyRepairDiscriminates:
      "right -= 1 is the one missing statement that gives the search window a shrinking measure to terminate on",
  },
}

const diagnosticShrinkingInterval: Exercise = {
  id: "diagnostic-shrinking-interval",
  title: "Diagnostic: shrinking interval",
  steps: [diagnosticShrinkingIntervalStep],
}

/**
 * Failure class 4: the double lookup — deliberately the same subject
 * matter as `entryApi`, in diagnostic form. Folded into `entryApi`'s tail
 * below (LTY-FAMILIES A4) rather than kept as a freestanding exercise.
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
 * test (`../index.test.ts`) treats id order as the ladder's order, and a
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
const entryApi: Exercise = {
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
          kind: "typing",
          source: "‹let slot = ›map.entry(key)‹;›",
          language: "rust",
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
          kind: "typing",
          source:
            "‹let slot = map.entry(key);\nlet filled = slot›.or_insert_with(Vec::new)‹;›",
          language: "rust",
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
          kind: "typing",
          source:
            "‹let slot = map.entry(key);\nlet filled = slot.or_insert_with(Vec::new);\nfilled›.push(value)‹;›",
          language: "rust",
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

/**
 * The awkward one. Not a lesson — a fixture.
 *
 * `PromptPanel` (#872) and the ui-fit sweep (#876) both need a step whose
 * prompt is hostile, a step whose proof is two characters, and a step with
 * no prompt at all. Those cases have to exist somewhere, and inventing them
 * separately in every story and test is how three slightly different
 * versions of "the long one" end up in the repo.
 *
 * A corpus is host-supplied data. Hostile input is not a hypothetical.
 */
const adversarial: Exercise = {
  id: "fixture-adversarial",
  title: "Shell stress fixture",
  steps: [
    {
      id: "adversarial-01-tiny-proof",
      goal: "Read a short prompt and type two characters.",
      concepts: [CONCEPT_IDS.fixture],
      blocks: [
        {
          kind: "prompt",
          lines: [
            "The shortest proof in the fixture set — the floor, not the exception.",
          ],
        },
        { kind: "typing", source: "ok", language: "rust" },
      ],
    },
    {
      id: "adversarial-02-no-prompt",
      goal: "Type a long body under no prompt at all.",
      concepts: [CONCEPT_IDS.fixture],
      blocks: [
        {
          kind: "typing",
          source:
            'fn main() {\n    let mut totals = HashMap::new();\n    for word in text.split_whitespace() {\n        *totals.entry(word).or_insert(0) += 1;\n    }\n    let mut ranked: Vec<_> = totals.into_iter().collect();\n    ranked.sort_by(|a, b| b.1.cmp(&a.1));\n    println!("{:?}", ranked);\n}',
          language: "rust",
        },
      ],
    },
    {
      id: "adversarial-03-one-line-each",
      goal: "One short line of prompt over one short line of proof.",
      concepts: [CONCEPT_IDS.fixture],
      blocks: [
        { kind: "prompt", lines: ["The ordinary case, for contrast."] },
        { kind: "typing", source: "let x = 1;", language: "rust" },
      ],
    },
  ],
}

/**
 * A prompt far past the budget `PromptBlockSchema` now enforces
 * (`PROMPT_MAX_LINES`, `types/exercise.ts`) — kept as a `Step`-shaped value
 * rather than a corpus entry, and deliberately never run through
 * `StepSchema`.
 *
 * The panel's pagination path is meant to be unreachable from a valid
 * corpus after E1, but it is still real code and it still has to be proven
 * to work — defensively, against exactly the kind of input the budget now
 * exists to reject. This is that input. It lives here rather than in
 * `SEED_EXERCISES` because `../index.ts`'s `CORPUS` is
 * `ExerciseCorpusSchema.parse`d at module load: a step this far over budget
 * would fail that parse and take every consumer of the shim down with it.
 */
export const HOSTILE_PROMPT_STEP: Step = {
  id: "fixture-hostile-prompt",
  goal: "Read a prompt far longer than the budget allows and type two characters.",
  concepts: [CONCEPT_IDS.fixture],
  blocks: [
    {
      kind: "prompt",
      lines: [
        "This prompt is deliberately longer than any prompt an authored exercise should ever carry, because the panel that renders it must decide what to do about that before a generated corpus decides for it.",
        "It runs to several lines, each of them long enough to wrap at a narrow viewport, so that the measured page and the truncation affordance are both exercised rather than merely present.",
        "A third line, for the case where two were not enough to overflow the box on a tall window.",
        "And a fourth, because a hostile corpus does not stop at three.",
        "A fifth line establishes that the panel's answer does not depend on the count being small.",
      ],
    },
    { kind: "typing", source: "ok", language: "rust" },
  ],
}

/**
 * The seed set, in the order the shim hands it out.
 *
 * Private to this module's directory by convention and to `../shim` by
 * lint: no consumer imports the data, only the function.
 */
export const SEED_EXERCISES: ReadonlyArray<Exercise> = [
  entryApi,
  diagnosticLoopProgress,
  diagnosticInclusiveBoundary,
  diagnosticShrinkingInterval,
  adversarial,
]

/** The one that reads like a real curriculum, for stories and tests. */
export const SEED_EXERCISE_ID = entryApi.id

/** The one that is deliberately hostile, for stories and tests. */
export const ADVERSARIAL_EXERCISE_ID = adversarial.id

/**
 * The three diagnostic instances still freestanding (LTY-FAMILIES A3), for
 * stories and tests. Two more — the double-lookup and eager-vs-lazy
 * instances — exist as steps but not as exercises: LTY-FAMILIES A4 folded
 * them into `entryApi`'s tail (see `entry-09-diagnostic-double-lookup` and
 * `entry-10-diagnostic-eager-lazy-default` above).
 */
export const DIAGNOSTIC_EXERCISE_IDS = [
  diagnosticLoopProgress.id,
  diagnosticInclusiveBoundary.id,
  diagnosticShrinkingInterval.id,
] as const
