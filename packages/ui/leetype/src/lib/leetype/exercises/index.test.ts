import {
  DiagnosticStepSchema,
  GOAL_MAX_CHARS,
  StepSchema,
  typingBlockOf,
} from "@leetype/types/exercise"
import { describe, expect, it } from "vitest"

import {
  FIXTURE_ADVERSARIAL_EXERCISE_ID,
  FIXTURE_DIAGNOSTIC_EXERCISE_IDS,
  FIXTURE_EXERCISE_ID,
  FIXTURE_HOSTILE_PROMPT_STEP,
  nextExercise,
} from "."

describe("the exercise shim", () => {
  it("hands back a valid exercise with no argument at all", () => {
    const exercise = nextExercise()
    expect(exercise.steps.length).toBeGreaterThan(0)
    expect(exercise.id).toBe(FIXTURE_EXERCISE_ID)
  })

  it("takes selection state and ignores it — the signature is the contract", () => {
    // The point of the argument is that the future pipeline is a body swap,
    // not a signature change through every caller. Ignoring it today is the
    // implementation.
    expect(nextExercise({ completed: ["rust-hashmap-entry"] }).id).toBe(
      FIXTURE_EXERCISE_ID
    )
  })

  it("honours an explicit preference, for stories and deep links", () => {
    expect(nextExercise({ preferId: FIXTURE_ADVERSARIAL_EXERCISE_ID }).id).toBe(
      FIXTURE_ADVERSARIAL_EXERCISE_ID
    )
  })

  it("falls back rather than throwing on an id nothing matches", () => {
    expect(nextExercise({ preferId: "no-such-exercise" }).id).toBe(
      FIXTURE_EXERCISE_ID
    )
  })
})

describe("the seed set", () => {
  it("carries one full curriculum, not a token two steps", () => {
    const exercise = nextExercise()
    expect(exercise.steps.length).toBeGreaterThanOrEqual(8)
    expect(exercise.steps.length).toBeLessThanOrEqual(12)
  })

  it("orders steps so each assumes only its predecessors", () => {
    // Structural stand-in for a claim only a reader can really check: every
    // step id is unique and the ids carry their position, so a reordering
    // that broke the ladder would be visible in a diff.
    const ids = nextExercise().steps.map((step) => step.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual([...ids].sort())
  })

  it("keeps every goal inside the sentence bound", () => {
    for (const exercise of [
      nextExercise(),
      nextExercise({ preferId: FIXTURE_ADVERSARIAL_EXERCISE_ID }),
    ]) {
      for (const step of exercise.steps) {
        expect(step.goal.length).toBeLessThanOrEqual(GOAL_MAX_CHARS)
      }
    }
  })

  it("varies proof length enough to shake out the shell", () => {
    const lengths = nextExercise().steps.map(
      (step) => typingBlockOf(step)?.source.length ?? 0
    )
    expect(Math.min(...lengths)).toBeLessThan(40)
    expect(Math.max(...lengths)).toBeGreaterThan(120)
  })

  it("ships the adversarial cases the shell stories need", () => {
    const steps = nextExercise({
      preferId: FIXTURE_ADVERSARIAL_EXERCISE_ID,
    }).steps

    const promptLines = steps.map(
      (step) => step.blocks.filter((block) => block.kind === "prompt").length
    )
    expect(promptLines).toContain(0)
    expect(Math.max(...promptLines)).toBeGreaterThan(0)

    const bodies = steps.map((step) => typingBlockOf(step)?.source ?? "")
    expect(Math.min(...bodies.map((body) => body.length))).toBeLessThan(5)
  })

  it("keeps sources inline — no path, no fetch, no formatting pass", () => {
    for (const step of nextExercise().steps) {
      const source = typingBlockOf(step)?.source ?? ""
      expect(source).not.toMatch(/^\/|^https?:/)
      expect(source.length).toBeGreaterThan(0)
    }
  })

  it("keeps every step in the validated corpus inside the prose budget", () => {
    // `CORPUS` is `ExerciseCorpusSchema.parse`d at module load, so this is
    // really just re-asserting a load-bearing fact — but a step this far
    // over budget failing silently at import time, in every consumer of the
    // shim at once, is exactly the failure a direct test here avoids.
    for (const exercise of [
      nextExercise(),
      nextExercise({ preferId: FIXTURE_ADVERSARIAL_EXERCISE_ID }),
    ]) {
      for (const step of exercise.steps) {
        expect(StepSchema.safeParse(step).success).toBe(true)
      }
    }
  })
})

describe("the five diagnostic instances (LTY-FAMILIES A3)", () => {
  it("ships exactly five, one per failure class", () => {
    expect(FIXTURE_DIAGNOSTIC_EXERCISE_IDS).toHaveLength(5)
    expect(new Set(FIXTURE_DIAGNOSTIC_EXERCISE_IDS).size).toBe(5)
  })

  it("each validates through the strict DiagnosticStepSchema, not just StepSchema", () => {
    // StepSchema accepting them is necessary (the shim's load-time parse
    // already proves it) but not sufficient — this is the check that they
    // actually satisfy the family's own contract: rationale present, a
    // trace block present, and the repair within the bounded-answer budget.
    // A step that passed StepSchema but failed this would be silent
    // evidence the fixture had drifted out of the shape it claims.
    for (const id of FIXTURE_DIAGNOSTIC_EXERCISE_IDS) {
      const exercise = nextExercise({ preferId: id })
      expect(exercise.id).toBe(id)
      expect(exercise.steps).toHaveLength(1)
      const result = DiagnosticStepSchema.safeParse(exercise.steps[0])
      const reason = result.success ? "" : result.error.message
      expect(result.success, `"${id}" failed: ${reason}`).toBe(true)
    }
  })

  it("keeps every repair a single line under the bounded-answer budget", () => {
    // "Copying each fully-revealed repair takes seconds, not a minute" —
    // approximated here as a hard length/line bound on the typed portion,
    // the same measure DiagnosticStepSchema itself enforces. The frame
    // around each repair is intentionally excluded (see typedPortionOf in
    // types/exercise.ts) and can run to several lines.
    for (const id of FIXTURE_DIAGNOSTIC_EXERCISE_IDS) {
      const exercise = nextExercise({ preferId: id })
      const source = typingBlockOf(exercise.steps[0]!)?.source ?? ""
      const typed = source.replace(/‹[^›]*›/g, "")
      expect(typed.length, `"${id}"'s typed repair`).toBeLessThanOrEqual(50)
      expect(typed).not.toMatch(/\n/)
    }
  })

  it("anchors every repair inside a visible frame, never floating beneath it", () => {
    // Constraint 6: revealable in isolation. Structurally, that means every
    // diagnostic instance's typing source actually uses a context span —
    // the repair sits inside the buggy attempt, not appended after a blank
    // canvas.
    for (const id of FIXTURE_DIAGNOSTIC_EXERCISE_IDS) {
      const exercise = nextExercise({ preferId: id })
      const source = typingBlockOf(exercise.steps[0]!)?.source ?? ""
      expect(source, `"${id}"'s frame`).toMatch(/‹.*›/s)
    }
  })

  it("keeps instances 4 and 5 alongside entryApi until A4 folds them in", () => {
    // The design discussion's own instruction: having both the flagship
    // exercise and its diagnostic counterexamples in the corpus at once is
    // the clearest available evidence for whether A4's rewrite is an
    // improvement. This test is the trip wire that catches either one
    // disappearing before A4 actually lands.
    const doubleLookup = nextExercise({ preferId: "diagnostic-double-lookup" })
    const eagerLazy = nextExercise({
      preferId: "diagnostic-eager-lazy-default",
    })
    expect(doubleLookup.id).toBe("diagnostic-double-lookup")
    expect(eagerLazy.id).toBe("diagnostic-eager-lazy-default")
    expect(nextExercise().id).toBe(FIXTURE_EXERCISE_ID)
  })
})

describe("the hostile prompt fixture", () => {
  it("is genuinely over budget — it fails StepSchema", () => {
    // The whole point of keeping it out of SEED_EXERCISES: a step this far
    // past PromptBlockSchema's line budget cannot survive the shim's
    // load-time validation, so it is exported as a raw, unvalidated value
    // instead. This test is the guarantee that it stays hostile rather than
    // quietly drifting inside the budget and testing nothing.
    expect(StepSchema.safeParse(FIXTURE_HOSTILE_PROMPT_STEP).success).toBe(
      false
    )
  })
})
