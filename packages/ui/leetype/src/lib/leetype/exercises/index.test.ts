import { GOAL_MAX_CHARS, typingBlockOf } from "@leetype/types/exercise"
import { describe, expect, it } from "vitest"

import {
  FIXTURE_ADVERSARIAL_EXERCISE_ID,
  FIXTURE_EXERCISE_ID,
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
})
