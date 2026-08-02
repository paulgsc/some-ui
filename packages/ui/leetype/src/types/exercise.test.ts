import { describe, expect, it } from "vitest"

import type { Block } from "./exercise"
import {
  ExerciseSchema,
  GOAL_MAX_CHARS,
  languageOf,
  promptBlocksOf,
  StepSchema,
  typingBlockOf,
} from "./exercise"

const prompt: Block = { kind: "prompt", lines: ["Why this matters."] }
const typing: Block = {
  kind: "typing",
  source: "let mut map = HashMap::new();",
  language: "rust",
}

/**
 * An unvalidated step candidate. Deliberately loose: these tests feed the
 * schema the shapes a host-supplied corpus can actually produce, which is
 * the point of having a schema at all.
 */
type StepCandidate = {
  id: string
  goal: string
  blocks: Array<Block>
  provenance?: { source: string; locator?: string }
}

function step(blocks: Array<Block>): StepCandidate {
  return {
    id: "s1",
    goal: "Create an empty mutable HashMap.",
    blocks,
  }
}

describe("StepSchema", () => {
  it("accepts n prompt blocks and exactly one typing block", () => {
    const parsed = StepSchema.parse(step([prompt, prompt, typing]))
    expect(parsed.blocks).toHaveLength(3)
    expect(parsed.concepts).toEqual([])
  })

  it("rejects a step with two typing blocks, and says why", () => {
    const result = StepSchema.safeParse(step([prompt, typing, typing]))
    expect(result.success).toBe(false)
    // The message is the point: a reader who hits this needs to know that
    // splitting the step is the fix, not that a count was wrong.
    expect(result.error?.issues[0]?.message).toMatch(/exactly one typing block/)
    expect(result.error?.issues[0]?.message).toMatch(/Split the step/)
  })

  it("rejects a step with no typing block", () => {
    const result = StepSchema.safeParse(step([prompt]))
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toMatch(/exactly one typing block/)
  })

  it("rejects a goal longer than a sentence — the bound is the design", () => {
    const tooBroad = {
      ...step([prompt, typing]),
      goal: "a".repeat(GOAL_MAX_CHARS + 1),
    }
    expect(StepSchema.safeParse(tooBroad).success).toBe(false)
  })

  it("rejects an empty typing source", () => {
    const empty = step([{ kind: "typing", source: "", language: "rust" }])
    expect(StepSchema.safeParse(empty).success).toBe(false)
  })

  it("keeps provenance optional and never needs it to render", () => {
    const withProvenance = StepSchema.parse({
      ...step([prompt, typing]),
      provenance: { source: "pnpm", locator: "src/resolve.ts" },
    })
    expect(withProvenance.provenance?.source).toBe("pnpm")
    expect(typingBlockOf(withProvenance)).toEqual(typing)
  })
})

describe("ExerciseSchema", () => {
  it("requires at least one step", () => {
    expect(
      ExerciseSchema.safeParse({ id: "e1", title: "Entry API", steps: [] })
        .success
    ).toBe(false)
  })

  it("validates a plain JSON value — no functions, no paths, no fetch", () => {
    const exercise = {
      id: "e1",
      title: "Entry API",
      steps: [step([prompt, typing])],
    }
    const roundTripped: unknown = JSON.parse(JSON.stringify(exercise))
    expect(ExerciseSchema.safeParse(roundTripped).success).toBe(true)
  })
})

describe("block helpers", () => {
  it("are total rather than throwing at render time", () => {
    // A step that slipped past validation must give a renderer an empty
    // viewport, not an exception.
    const malformed = { id: "x", goal: "g", blocks: [prompt], concepts: [] }
    expect(typingBlockOf(malformed)).toBeUndefined()
    expect(languageOf(malformed)).toBe("rust")
    expect(promptBlocksOf(malformed)).toEqual([prompt])
  })

  it("separates what is read from what is typed", () => {
    const parsed = StepSchema.parse(step([prompt, typing, prompt]))
    expect(promptBlocksOf(parsed)).toHaveLength(2)
    expect(typingBlockOf(parsed)?.source).toBe(typing.source)
    expect(languageOf(parsed)).toBe("rust")
  })
})

describe("the view contract's extension point", () => {
  it("admits a new prompt-side kind without the typing path changing", () => {
    // The acceptance criterion, exercised rather than asserted: a future
    // `hint` block is a prompt-side addition. Until the union grows, the
    // demonstration is that the typing path reads *only* the typing block
    // and is indifferent to how many other blocks sit beside it.
    const many = StepSchema.parse(
      step([prompt, prompt, prompt, typing, prompt])
    )
    expect(typingBlockOf(many)).toEqual(typing)
    expect(languageOf(many)).toBe("rust")
  })
})
