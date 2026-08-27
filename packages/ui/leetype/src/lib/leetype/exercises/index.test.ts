import {
  ConstructionStepSchema,
  DiagnosticStepSchema,
  GOAL_MAX_CHARS,
  renderedDiffLineKinds,
  StepSchema,
  typingBlockOf,
} from "@leetype/types/exercise"
import { describe, expect, it } from "vitest"

import {
  FIXTURE_ADVERSARIAL_EXERCISE_ID,
  FIXTURE_DIAGNOSTIC_EXERCISE_IDS,
  FIXTURE_EXERCISE_ID,
  FIXTURE_HOSTILE_PROMPT_STEP,
  FIXTURE_LEETCODE_3302_EXERCISE_ID,
  nextExercise,
  SESSION_EXERCISE_IDS,
} from "."

describe("the exercise shim", () => {
  it("adds the 24-rung engineering-judgment curriculum alongside the existing corpus", () => {
    // Additive, not a replacement: the new curriculum joins session rotation
    // on both surfaces, it does not become the only thing either one serves.
    expect(SESSION_EXERCISE_IDS).toContain(FIXTURE_LEETCODE_3302_EXERCISE_ID)
    expect(SESSION_EXERCISE_IDS.length).toBeGreaterThan(1)
    const exercise = nextExercise({
      preferId: FIXTURE_LEETCODE_3302_EXERCISE_ID,
    })
    expect(exercise.steps).toHaveLength(24)
    for (const step of exercise.steps) {
      expect(step.obligation).toContain("Decision:")
      expect(step.obligation).toContain("Boundary:")
      expect(step.rationaleChoices).toHaveLength(3)
      expect(
        step.rationaleChoices?.filter((choice) => choice.canonical)
      ).toHaveLength(1)
    }
  })

  it("hands back the exercise its preferId names", () => {
    const exercise = nextExercise({ preferId: FIXTURE_EXERCISE_ID })
    expect(exercise.steps.length).toBeGreaterThan(0)
    expect(exercise.id).toBe(FIXTURE_EXERCISE_ID)
  })

  it("takes selection state and ignores everything but preferId — the signature is the contract", () => {
    // The point of `completed` is that the future pipeline is a body swap,
    // not a signature change through every caller. Ignoring it today is the
    // implementation.
    expect(
      nextExercise({
        completed: ["rust-hashmap-entry"],
        preferId: FIXTURE_EXERCISE_ID,
      }).id
    ).toBe(FIXTURE_EXERCISE_ID)
  })

  it("honours an explicit preference, for stories and deep links", () => {
    expect(nextExercise({ preferId: FIXTURE_ADVERSARIAL_EXERCISE_ID }).id).toBe(
      FIXTURE_ADVERSARIAL_EXERCISE_ID
    )
  })

  it("throws on an id nothing in the corpus matches, rather than silently substituting a default", () => {
    // The deterministic-first-item fallback this shim used to have is
    // exactly the behavior the session scheduler and deep links exist to
    // replace — a stale or typo'd id should fail loudly at the seam, not
    // quietly resolve to entryApi.
    expect(() => nextExercise({ preferId: "no-such-exercise" })).toThrow(
      /is not an id in the validated corpus/
    )
  })
})

describe("the seed set", () => {
  it("carries one full curriculum, not a token two steps", () => {
    const exercise = nextExercise({ preferId: FIXTURE_EXERCISE_ID })
    expect(exercise.steps.length).toBeGreaterThanOrEqual(8)
    expect(exercise.steps.length).toBeLessThanOrEqual(12)
  })

  it("orders steps so each assumes only its predecessors", () => {
    // Structural stand-in for a claim only a reader can really check: every
    // step id is unique and the ids carry their position, so a reordering
    // that broke the ladder would be visible in a diff.
    const ids = nextExercise({ preferId: FIXTURE_EXERCISE_ID }).steps.map(
      (step) => step.id
    )
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual([...ids].sort())
  })

  it("keeps every goal inside the sentence bound", () => {
    for (const exercise of [
      nextExercise({ preferId: FIXTURE_EXERCISE_ID }),
      nextExercise({ preferId: FIXTURE_ADVERSARIAL_EXERCISE_ID }),
    ]) {
      for (const step of exercise.steps) {
        expect(step.goal.length).toBeLessThanOrEqual(GOAL_MAX_CHARS)
      }
    }
  })

  it("varies proof length enough to shake out the shell", () => {
    const lengths = nextExercise({ preferId: FIXTURE_EXERCISE_ID }).steps.map(
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
    for (const step of nextExercise({ preferId: FIXTURE_EXERCISE_ID }).steps) {
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
      nextExercise({ preferId: FIXTURE_EXERCISE_ID }),
      nextExercise({ preferId: FIXTURE_ADVERSARIAL_EXERCISE_ID }),
    ]) {
      for (const step of exercise.steps) {
        expect(StepSchema.safeParse(step).success).toBe(true)
      }
    }
  })
})

describe("the diagnostic instances still freestanding (LTY-FAMILIES A3)", () => {
  it("ships three, one per failure class — the other two moved into entryApi (A4)", () => {
    expect(FIXTURE_DIAGNOSTIC_EXERCISE_IDS).toHaveLength(3)
    expect(new Set(FIXTURE_DIAGNOSTIC_EXERCISE_IDS).size).toBe(3)
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

  it("no longer serves instances 4 and 5 as freestanding exercises (A4 folded them in)", () => {
    // The freestanding ids from A3 must not resolve to anything anymore —
    // nextExercise throws rather than silently keeping a duplicate around.
    expect(() =>
      nextExercise({ preferId: "diagnostic-double-lookup" })
    ).toThrow(/is not an id in the validated corpus/)
    expect(() =>
      nextExercise({ preferId: "diagnostic-eager-lazy-default" })
    ).toThrow(/is not an id in the validated corpus/)
  })
})

describe("entryApi's diagnostic tail (LTY-FAMILIES A4)", () => {
  it("carries the double-lookup and eager-lazy-default steps, renamed to sort with the ladder", () => {
    const steps = nextExercise({ preferId: FIXTURE_EXERCISE_ID }).steps
    const doubleLookup = steps.find(
      (step) => step.id === "entry-09-diagnostic-double-lookup"
    )
    const eagerLazy = steps.find(
      (step) => step.id === "entry-10-diagnostic-eager-lazy-default"
    )
    expect(doubleLookup).toBeDefined()
    expect(eagerLazy).toBeDefined()
  })

  it("keeps both tail steps strictly valid as diagnostic instances, not just plain steps", () => {
    const steps = nextExercise({ preferId: FIXTURE_EXERCISE_ID }).steps
    const tail = steps.filter(
      (step) =>
        step.id.startsWith("entry-09-") || step.id.startsWith("entry-10-")
    )
    expect(tail).toHaveLength(2)
    for (const step of tail) {
      const result = DiagnosticStepSchema.safeParse(step)
      const reason = result.success ? "" : result.error.message
      expect(result.success, `"${step.id}" failed: ${reason}`).toBe(true)
    }
  })

  it("orders the diagnostic tail after every commitment, composition and transfer step", () => {
    const ids = nextExercise({ preferId: FIXTURE_EXERCISE_ID }).steps.map(
      (step) => step.id
    )
    const tailStart = ids.indexOf("entry-09-diagnostic-double-lookup")
    expect(tailStart).toBeGreaterThan(0)
    expect(tailStart).toBe(ids.length - 2)
  })

  it("carries no PromptBlock anywhere — no conceptual exposition survived the rewrite", () => {
    for (const step of nextExercise({ preferId: FIXTURE_EXERCISE_ID }).steps) {
      const hasPrompt = step.blocks.some((block) => block.kind === "prompt")
      expect(hasPrompt, `step "${step.id}" still has a prompt block`).toBe(
        false
      )
    }
  })

  it("validates every commitment, composition and transfer step as a strict ConstructionStep", () => {
    const commitmentIds = [
      "entry-03-place",
      "entry-04-fill",
      "entry-05-mutate",
      "entry-06-compose",
      "entry-07-transfer",
      "entry-08-generalize",
    ]
    const steps = nextExercise({ preferId: FIXTURE_EXERCISE_ID }).steps
    for (const id of commitmentIds) {
      const step = steps.find((candidate) => candidate.id === id)
      expect(step, `step "${id}" not found`).toBeDefined()
      const result = ConstructionStepSchema.safeParse(step)
      const reason = result.success ? "" : result.error.message
      expect(result.success, `"${id}" failed: ${reason}`).toBe(true)
    }
  })
})

describe("the construction reading — entryApi as an accumulating hunk (LTY-PATCH P5, #1080)", () => {
  /** The rendered form of a `‹…›`-marked source: delimiters stripped, content kept. */
  function renderedFormOf(source: string): string {
    return source.replace(/[‹›]/g, "")
  }

  it("gives entry-03/04/05 a diff overlay whose rendered add lines are exactly the step's own witness", () => {
    const steps = nextExercise({ preferId: FIXTURE_EXERCISE_ID }).steps
    const commitments = [
      { id: "entry-03-place", lineKinds: ["add"] },
      { id: "entry-04-fill", lineKinds: ["context", "add"] },
      { id: "entry-05-mutate", lineKinds: ["context", "context", "add"] },
    ]
    for (const { id, lineKinds } of commitments) {
      const step = steps.find((candidate) => candidate.id === id)
      const typing = step ? typingBlockOf(step) : undefined
      expect(typing?.diff, `"${id}" has no diff overlay`).toBeDefined()
      expect(typing?.diff && renderedDiffLineKinds(typing.diff)).toEqual(
        lineKinds
      )
    }
  })

  it("re-shows each commitment's whole rendered line as the next step's leading context", () => {
    // The claim the epic actually rests on for this story: the chain reads
    // as one accumulating hunk, not three unrelated ones — each step's `+`
    // line is exactly the same text the next step carries forward as `‹context›`.
    const steps = nextExercise({ preferId: FIXTURE_EXERCISE_ID }).steps
    const place = steps.find((s) => s.id === "entry-03-place")
    const fill = steps.find((s) => s.id === "entry-04-fill")
    const mutate = steps.find((s) => s.id === "entry-05-mutate")
    const placeSource = place ? typingBlockOf(place)?.source : undefined
    const fillSource = fill ? typingBlockOf(fill)?.source : undefined
    const mutateSource = mutate ? typingBlockOf(mutate)?.source : undefined
    expect(placeSource).toBeDefined()
    expect(fillSource).toBeDefined()
    expect(mutateSource).toBeDefined()

    const placeRendered = renderedFormOf(placeSource ?? "")
    const fillRendered = renderedFormOf(fillSource ?? "")
    const mutateRendered = renderedFormOf(mutateSource ?? "")

    expect(fillRendered.startsWith(placeRendered)).toBe(true)
    expect(mutateRendered.startsWith(fillRendered)).toBe(true)
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
