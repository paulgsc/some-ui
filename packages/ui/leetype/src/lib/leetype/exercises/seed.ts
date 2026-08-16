import type { DiagnosticStep, Exercise, Step } from "@leetype/types/exercise"

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
 * The motivation's own example, decomposed.
 *
 * The line the whole exercise builds toward is
 * `map.entry(key).or_insert_with(Vec::new).push(value);`, and what is being
 * taught is emphatically **not** the module that line came from. The steps
 * prove ownership of a mutable binding, the shape of a lookup that can
 * insert, why `or_insert_with` and `or_insert` are not the same call, and
 * why the whole thing is one lookup rather than two. That the line came from
 * somewhere is incidental — which is the point being demonstrated.
 *
 * Lengths vary on purpose: a two-token proof and a six-line one in the same
 * exercise is what shakes the shell out.
 */
const entryApi: Exercise = {
  id: "rust-hashmap-entry",
  title: "The Entry API",
  steps: [
    {
      id: "entry-01-import",
      goal: "Bring HashMap into scope.",
      concepts: ["use declarations", "std::collections"],
      blocks: [
        {
          kind: "prompt",
          lines: [
            "HashMap is not in the prelude. Everything that follows needs it in scope.",
          ],
        },
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
      concepts: ["mutability", "type inference"],
      blocks: [
        {
          kind: "prompt",
          lines: [
            "`mut` is not decoration. Without it the next four steps do not compile,",
            "and the compiler will tell you so at the call site rather than here.",
          ],
        },
        {
          kind: "typing",
          source: "let mut map = HashMap::new();",
          language: "rust",
        },
      ],
    },
    {
      id: "entry-03-naive-insert",
      goal: "Insert a value the blunt way, and notice what it costs.",
      concepts: ["HashMap::insert", "ownership transfer"],
      blocks: [
        {
          kind: "prompt",
          lines: [
            "`insert` overwrites. It is the right call when you know you are replacing,",
            "and the wrong one whenever the existing value matters.",
          ],
        },
        {
          kind: "typing",
          source: 'map.insert("a", vec![1]);',
          language: "rust",
        },
      ],
    },
    {
      id: "entry-04-double-lookup",
      goal: "Write the two-lookup version that the Entry API exists to replace.",
      concepts: ["contains_key", "double lookup"],
      blocks: [
        {
          kind: "prompt",
          lines: [
            "This works, and it hashes the key twice — once to ask, once to answer.",
            "Hold on to how it reads; the next steps are about deleting it.",
          ],
        },
        {
          kind: "typing",
          source:
            'if !map.contains_key("b") {\n    map.insert("b", Vec::new());\n}',
          language: "rust",
        },
      ],
    },
    {
      id: "entry-05-entry",
      goal: "Ask the map for the entry at a key rather than for its value.",
      concepts: ["Entry", "borrowing"],
      blocks: [
        {
          kind: "prompt",
          lines: [
            "`entry` hands back a place in the map — occupied or vacant — not a value.",
            "That is the whole trick: the lookup has already happened.",
          ],
        },
        {
          kind: "typing",
          source: 'let slot = map.entry("b");',
          language: "rust",
        },
      ],
    },
    {
      id: "entry-06-or-insert",
      goal: "Fill a vacant entry with a default, leaving an occupied one alone.",
      concepts: ["Entry::or_insert", "default values"],
      blocks: [
        {
          kind: "prompt",
          lines: [
            "One call, one hash. If the key was there, nothing is written.",
          ],
        },
        {
          kind: "typing",
          source: 'map.entry("b").or_insert(Vec::new());',
          language: "rust",
        },
      ],
    },
    {
      id: "entry-07-or-insert-with",
      goal: "Build the default only when it is actually needed.",
      concepts: ["Entry::or_insert_with", "closures", "eager vs lazy"],
      blocks: [
        {
          kind: "prompt",
          lines: [
            "`or_insert` evaluates its argument even when the key is already present.",
            "`or_insert_with` takes a closure, called only on the vacant path.",
          ],
        },
        {
          kind: "typing",
          source: 'map.entry("b").or_insert_with(Vec::new);',
          language: "rust",
        },
      ],
    },
    {
      id: "entry-08-push",
      goal: "Push onto the vector you just got back, without a second lookup.",
      concepts: [
        "Entry::or_insert_with",
        "mutable references",
        "method chaining",
      ],
      blocks: [
        {
          kind: "prompt",
          lines: [
            "`or_insert_with` returns `&mut V`. Chain straight onto it.",
            "This one line is what the whole exercise was for.",
          ],
        },
        {
          kind: "typing",
          source: 'map.entry("b").or_insert_with(Vec::new).push(7);',
          language: "rust",
        },
      ],
      provenance: {
        source: "The pattern this exercise was distilled from",
        locator: "std::collections::hash_map::Entry",
      },
    },
    {
      id: "entry-09-counter",
      goal: "Count occurrences with the same shape, over an integer instead of a vector.",
      concepts: ["Entry::or_insert", "in-place mutation"],
      blocks: [
        {
          kind: "prompt",
          lines: [
            "The shape transfers. Dereference the `&mut i32` and add to it in place.",
          ],
        },
        {
          kind: "typing",
          source: "*counts.entry(word).or_insert(0) += 1;",
          language: "rust",
        },
      ],
    },
    {
      id: "entry-10-whole-function",
      goal: "Assemble the pattern into a function that groups values by key.",
      concepts: ["generics", "trait bounds", "Entry::or_default"],
      blocks: [
        {
          kind: "prompt",
          lines: [
            "Everything above, once, in a signature that says what it does.",
            "`or_default` is `or_insert_with(Default::default)` with a shorter name.",
          ],
        },
        {
          kind: "typing",
          source:
            "fn group<K: Eq + Hash, V>(pairs: Vec<(K, V)>) -> HashMap<K, Vec<V>> {\n    let mut out = HashMap::new();\n    for (key, value) in pairs {\n        out.entry(key).or_default().push(value);\n    }\n    out\n}",
          language: "rust",
        },
      ],
    },
  ],
}

/**
 * Five diagnostic instances (LTY-FAMILIES A3), hand-authored, chosen to
 * span the failure classes rather than the topics — the design
 * discussion's own recommendation, and the posture this file already
 * takes with `entryApi`: validate the interaction by hand before there is
 * anything to judge a generator's output against.
 *
 * `diagnosticDoubleLookupStep` and `diagnosticEagerLazyDefaultStep` are each
 * kept as a named local, not inlined into their exercise's `steps` array,
 * because they are deliberately the same subject matter as `entryApi`'s own
 * motivation (the design discussion's instruction — "the same subject
 * matter as the existing Entry API exercise, in diagnostic form"), and
 * LTY-FAMILIES A4 folds both into `entryApi`'s tail as the diagnostic
 * handoff — reusing the same local identifier, in this same file, rather
 * than retyping the step — at which point they stop being freestanding
 * exercises.
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
  concepts: ["loop progress", "mutable state"],
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
  concepts: ["exclusive vs inclusive bounds", "slice indexing"],
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
  concepts: ["loop progress", "window shrinking"],
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
 * matter as `entryApi`, in diagnostic form. See this file's module doc:
 * LTY-FAMILIES A4 folds this step into `entryApi`'s tail, at which point
 * `diagnosticDoubleLookup` (the exercise wrapper below) is removed from
 * `SEED_EXERCISES` rather than kept as a freestanding entry.
 */
const diagnosticDoubleLookupStep: DiagnosticStep = {
  id: "diagnostic-double-lookup-01",
  goal: "Replace the naive check-then-fetch with the single-lookup Entry call.",
  concepts: ["Entry API", "double lookup", "amortized hashing"],
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

const diagnosticDoubleLookup: Exercise = {
  id: "diagnostic-double-lookup",
  title: "Diagnostic: double lookup",
  steps: [diagnosticDoubleLookupStep],
}

/**
 * Failure class 5: eager vs. lazy default construction — the same subject
 * matter as `entryApi`'s `or_insert_with` step, in diagnostic form. Folded
 * into `entryApi`'s tail by LTY-FAMILIES A4, same as failure class 4 above.
 */
const diagnosticEagerLazyDefaultStep: DiagnosticStep = {
  id: "diagnostic-eager-lazy-default-01",
  goal: "Make the default lazy, so the constructor runs only on the call that needs it.",
  concepts: ["Entry::or_insert_with", "eager vs lazy evaluation"],
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

const diagnosticEagerLazyDefault: Exercise = {
  id: "diagnostic-eager-lazy-default",
  title: "Diagnostic: eager vs. lazy default",
  steps: [diagnosticEagerLazyDefaultStep],
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
      concepts: ["fixture"],
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
      concepts: ["fixture"],
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
      concepts: ["fixture"],
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
  concepts: ["fixture"],
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
  diagnosticDoubleLookup,
  diagnosticEagerLazyDefault,
  adversarial,
]

/** The one that reads like a real curriculum, for stories and tests. */
export const SEED_EXERCISE_ID = entryApi.id

/** The one that is deliberately hostile, for stories and tests. */
export const ADVERSARIAL_EXERCISE_ID = adversarial.id

/** The five diagnostic instances (LTY-FAMILIES A3), for stories and tests. */
export const DIAGNOSTIC_EXERCISE_IDS = [
  diagnosticLoopProgress.id,
  diagnosticInclusiveBoundary.id,
  diagnosticShrinkingInterval.id,
  diagnosticDoubleLookup.id,
  diagnosticEagerLazyDefault.id,
] as const
