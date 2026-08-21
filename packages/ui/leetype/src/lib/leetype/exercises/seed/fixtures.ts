import { CONCEPT_IDS } from "@leetype/lib/leetype/exercises/concepts"
import type { Exercise, Step } from "@leetype/types/exercise"

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
 *
 * Kept in its own module, deliberately not named after a concept: a
 * generator that reads this directory for worked examples must not mistake
 * shell-stress data for something that was ever meant to validate — see
 * `CONCEPT_IDS.fixture`'s own doc comment for the same distinction.
 */
export const adversarial: Exercise = {
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
