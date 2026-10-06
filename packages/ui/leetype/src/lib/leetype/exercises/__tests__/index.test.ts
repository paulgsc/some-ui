import {
  ALL_FIXTURE_EXERCISES,
  FIXTURE_ADVERSARIAL_EXERCISE_ID,
  FIXTURE_DIAGNOSTIC_EXERCISE_IDS,
  FIXTURE_EXERCISE_ID,
  FIXTURE_HOSTILE_PROMPT_STEP,
  FIXTURE_LEETCODE_3302_EXERCISE_ID,
  nextExercise,
  SESSION_EXERCISE_IDS,
} from "@leetype/lib/leetype/exercises"
import type { RenderedDiffLineKind } from "@leetype/types/exercise"
import {
  ConstructionStepSchema,
  DiagnosticStepSchema,
  GOAL_MAX_CHARS,
  renderedDiffLineKinds,
  StepSchema,
  typingBlockOf,
} from "@leetype/types/exercise"
import { describe, expect, it } from "vitest"

describe("the exercise shim", () => {
  it("adds the 24-rung engineering-judgment curriculum alongside the existing corpus", () => {
    // Additive: the new curriculum joins the rotation, not replaces it.
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
    // `completed` is accepted so a future pipeline is a body swap.
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
    // A stale or typo'd id fails at the seam, not quietly resolving to entryApi.
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
    // Already parsed at module load; a direct test names the failure.
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
    // The generic parse is not enough: each must satisfy the family's own
    // contract (rationale, trace block, bounded repair).
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
    // "Seconds to copy, not a minute": a bound on the typed portion only;
    // the frame may run to several lines.
    for (const id of FIXTURE_DIAGNOSTIC_EXERCISE_IDS) {
      const exercise = nextExercise({ preferId: id })
      const source = typingBlockOf(exercise.steps[0]!)?.source ?? ""
      const typed = source.replace(/‹[^›]*›/g, "")
      expect(typed.length, `"${id}"'s typed repair`).toBeLessThanOrEqual(50)
      expect(typed).not.toMatch(/\n/)
    }
  })

  it("anchors every repair inside a visible frame, never floating beneath it", () => {
    // Constraint 6: the repair sits inside a context span, not after a blank.
    for (const id of FIXTURE_DIAGNOSTIC_EXERCISE_IDS) {
      const exercise = nextExercise({ preferId: id })
      const source = typingBlockOf(exercise.steps[0]!)?.source ?? ""
      expect(source, `"${id}"'s frame`).toMatch(/‹.*›/s)
    }
  })

  it("no longer serves instances 4 and 5 as freestanding exercises (A4 folded them in)", () => {
    // The retired freestanding ids must not resolve.
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

describe("the construction reading — entryApi as an accumulating hunk (LTY-PATCH)", () => {
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
    // One accumulating hunk: each step's `+` line is the next step's `‹context›`.
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

/**
 * Pins `renderedDiffLineKinds` for every corpus step with a `.diff` overlay
 * (Def. 1.4's reuse of `DiffHunkSchema`). A new diff hunk must extend this
 * table, so no hunk drifts untested.
 */
describe("renderedDiffLineKinds is pinned across every corpus hunk", () => {
  it("computes the same per-line classification for every DiffHunk in the corpus", () => {
    const PINNED_KINDS: Readonly<
      Record<string, ReadonlyArray<RenderedDiffLineKind>>
    > = {
      "entry-03-place": ["add"],
      "entry-04-fill": ["context", "add"],
      "entry-05-mutate": ["context", "context", "add"],
      "diagnostic-loop-progress-01": ["context", "context", "add", "context"],
      "diagnostic-division-guard-01": [
        "context",
        "add",
        "add",
        "add",
        "context",
        "context",
      ],
      "construction-lazy-default-01": ["del", "add"],
      "diagnostic-memoization-01": [
        "context",
        "add",
        "add",
        "add",
        "context",
        "context",
        "context",
        "context",
        "context",
        "context",
        "context",
      ],
      "construction-binary-search-place-01": ["del", "add"],
    }

    const foundIds = new Set<string>()
    for (const exercise of ALL_FIXTURE_EXERCISES) {
      for (const step of exercise.steps) {
        const diff = typingBlockOf(step)?.diff
        if (diff === undefined) continue
        foundIds.add(step.id)
        expect(renderedDiffLineKinds(diff), `"${step.id}"`).toEqual(
          PINNED_KINDS[step.id]
        )
      }
    }

    // Every pinned id exists, and no unpinned diff hunk does.
    expect(foundIds).toEqual(new Set(Object.keys(PINNED_KINDS)))
  })
})

describe("the hostile prompt fixture", () => {
  it("is genuinely over budget — it fails StepSchema", () => {
    // Kept out of the validated corpus; this keeps it over budget.
    expect(StepSchema.safeParse(FIXTURE_HOSTILE_PROMPT_STEP).success).toBe(
      false
    )
  })
})
