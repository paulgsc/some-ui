import type { Exercise, Step } from "@leetype/types/exercise"

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
export const SEED_EXERCISES: ReadonlyArray<Exercise> = [entryApi, adversarial]

/** The one that reads like a real curriculum, for stories and tests. */
export const SEED_EXERCISE_ID = entryApi.id

/** The one that is deliberately hostile, for stories and tests. */
export const ADVERSARIAL_EXERCISE_ID = adversarial.id
