import { describe, expect, it } from "vitest"

import type { Block } from "./exercise"
import {
  BlockSchema,
  DIAGNOSTIC_REPAIR_MAX_CHARS,
  DiagnosticStepSchema,
  ExerciseSchema,
  GOAL_MAX_CHARS,
  languageOf,
  PROMPT_LINE_MAX_CHARS,
  PROMPT_MAX_LINES,
  PromptBlockSchema,
  promptBlocksOf,
  RegionBlockSchema,
  StepSchema,
  TraceBlockSchema,
  TransitionBlockSchema,
  typingBlockOf,
  TypingBlockSchema,
} from "./exercise"

const prompt: Block = { kind: "prompt", lines: ["Why this matters."] }
const typing: Block = {
  kind: "typing",
  source: "let mut map = HashMap::new();",
  language: "rust",
}
const transition: Block = {
  kind: "transition",
  label: "lookups",
  before: "2 lookups",
  after: "1 lookup",
}
const trace: Block = {
  kind: "trace",
  headline: "TIMEOUT",
  observations: [
    { label: "iterations", value: "10,000" },
    { label: "cursor", value: "0 → 0" },
  ],
}
const region: Block = {
  kind: "region",
  label: "the finalized prefix",
  startDisplay: 0,
  endDisplay: 12,
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

  it("rejects several on-budget prompt blocks that are over budget combined", () => {
    // Each block alone satisfies PromptBlockSchema's per-block bound, but
    // stacked sideways they are still more prose than the panel's
    // pagination-free path was built to hold — the gap a single per-block
    // check leaves open.
    const twoLineBlock: Block = {
      kind: "prompt",
      lines: ["First line.", "Second line."],
    }
    const stacked = step([twoLineBlock, twoLineBlock, typing])
    const result = StepSchema.safeParse(stacked)
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toMatch(/combined/)
    expect(result.error?.issues[0]?.message).toMatch(/split the step/i)
  })

  it("accepts several prompt blocks whose combined lines stay in budget", () => {
    const oneLineBlock: Block = { kind: "prompt", lines: ["A short line."] }
    const stacked = step([oneLineBlock, oneLineBlock, typing])
    expect(StepSchema.safeParse(stacked).success).toBe(true)
  })
})

describe("PromptBlockSchema — the prose budget", () => {
  it("accepts a prompt at the line limit", () => {
    const atLimit = {
      kind: "prompt",
      lines: Array(PROMPT_MAX_LINES).fill("A short line."),
    }
    expect(PromptBlockSchema.safeParse(atLimit).success).toBe(true)
  })

  it("rejects a prompt with more lines than the budget, and says why", () => {
    const overLimit = {
      kind: "prompt",
      lines: Array(PROMPT_MAX_LINES + 1).fill("A short line."),
    }
    const result = PromptBlockSchema.safeParse(overLimit)
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toMatch(/more than 2 lines/)
    expect(result.error?.issues[0]?.message).toMatch(/Split the step/)
  })

  it("rejects a single line longer than the per-line budget, and says why", () => {
    const tooLong = {
      kind: "prompt",
      lines: ["a".repeat(PROMPT_LINE_MAX_CHARS + 1)],
    }
    const result = PromptBlockSchema.safeParse(tooLong)
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toMatch(/past 120 characters/)
    expect(result.error?.issues[0]?.message).toMatch(/pointer, not a paragraph/)
  })

  it("accepts a line right at the per-line budget", () => {
    const atLimit = {
      kind: "prompt",
      lines: ["a".repeat(PROMPT_LINE_MAX_CHARS)],
    }
    expect(PromptBlockSchema.safeParse(atLimit).success).toBe(true)
  })
})

describe("the evidence block kinds", () => {
  it("accepts a transition, with and without its optional label", () => {
    expect(TransitionBlockSchema.safeParse(transition).success).toBe(true)
    expect(
      TransitionBlockSchema.safeParse({
        kind: "transition",
        before: "2 lookups",
        after: "1 lookup",
      }).success
    ).toBe(true)
  })

  it("rejects a transition missing either side of the pair", () => {
    expect(
      TransitionBlockSchema.safeParse({ kind: "transition", before: "x" })
        .success
    ).toBe(false)
  })

  it("accepts a trace, with and without its optional headline", () => {
    expect(TraceBlockSchema.safeParse(trace).success).toBe(true)
    expect(
      TraceBlockSchema.safeParse({
        kind: "trace",
        observations: [{ label: "cursor", value: "0 → 0" }],
      }).success
    ).toBe(true)
  })

  it("requires at least one observation in a trace block", () => {
    expect(
      TraceBlockSchema.safeParse({ kind: "trace", observations: [] }).success
    ).toBe(false)
  })

  it("accepts a region whose end comes after its start", () => {
    expect(RegionBlockSchema.safeParse(region).success).toBe(true)
  })

  it("rejects a region whose end does not come after its start, and says why", () => {
    const result = RegionBlockSchema.safeParse({
      kind: "region",
      label: "x",
      startDisplay: 5,
      endDisplay: 5,
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toMatch(/end must come after/)
  })

  it("mixes prompt, transition, trace and region blocks around one typing block", () => {
    const parsed = StepSchema.parse(
      step([prompt, transition, trace, region, typing])
    )
    expect(parsed.blocks).toHaveLength(5)
    expect(typingBlockOf(parsed)).toEqual(typing)
  })
})

describe("a region's span against the step's typing source", () => {
  it("rejects a region reaching past the typing source's length, and says why", () => {
    // typing.source is "let mut map = HashMap::new();" (30 chars) — a span
    // running to 100 is unambiguously past it regardless of what the engine
    // eventually renders.
    const outOfRange: Block = {
      kind: "region",
      label: "past the end",
      startDisplay: 5,
      endDisplay: 100,
    }
    const result = StepSchema.safeParse(step([outOfRange, typing]))
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toMatch(/reaches past/)
  })

  it("accepts a region whose span fits inside the typing source", () => {
    expect(StepSchema.safeParse(step([region, typing])).success).toBe(true)
  })
})

describe("the block union is closed", () => {
  it("rejects an unknown kind rather than passing it through", () => {
    const unknown = { kind: "hint", text: "not a real kind" }
    expect(BlockSchema.safeParse(unknown).success).toBe(false)
  })

  it("leaves TypingBlockSchema exactly as it was", () => {
    expect(TypingBlockSchema.safeParse(typing).success).toBe(true)
    // The typing path never grows a case for the new evidence kinds — its
    // shape is still exactly kind/source/language.
    expect(Object.keys(TypingBlockSchema.shape).sort()).toEqual(
      ["kind", "language", "source"].sort()
    )
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

describe("DiagnosticStepSchema — the falsification→repair family", () => {
  const failure: Block = {
    kind: "trace",
    headline: "TIMEOUT",
    observations: [{ label: "cursor", value: "0 → 0" }],
  }
  const shortRepair: Block = {
    kind: "typing",
    source: "cursor += 1;",
    language: "rust",
  }
  const rationale = {
    cause: "the loop advances nothing, so cursor never reaches input.len()",
    whyRepairDiscriminates:
      "incrementing cursor is the only change that makes the loop terminate",
  }

  it("keeps rationale optional on the plain StepSchema", () => {
    const parsed = StepSchema.parse(step([failure, shortRepair]))
    expect(parsed.rationale).toBeUndefined()
  })

  it("rejects a diagnostic step with no rationale, at the rationale path", () => {
    const result = DiagnosticStepSchema.safeParse(step([failure, shortRepair]))
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual(["rationale"])
  })

  it("rejects a diagnostic step with no trace block, and says why", () => {
    const result = DiagnosticStepSchema.safeParse({
      ...step([shortRepair]),
      rationale,
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toMatch(/must carry a trace block/)
  })

  it("accepts a diagnostic step whose rationale and trace block are present", () => {
    const result = DiagnosticStepSchema.safeParse({
      ...step([failure, shortRepair]),
      rationale,
    })
    expect(result.success).toBe(true)
  })

  it("preserves rationale through the generic StepSchema/ExerciseSchema parse", () => {
    // The corpus lint's whole premise depends on this: `nextExercise`'s
    // shim parses every seed exercise through `ExerciseCorpusSchema`
    // (generic `StepSchema`, not `DiagnosticStepSchema`), so a `rationale`
    // authored on a diagnostic instance must survive that generic parse
    // rather than being stripped as an unrecognized key.
    const exercise = ExerciseSchema.parse({
      id: "e1",
      title: "Diagnostic fixture",
      steps: [{ ...step([failure, shortRepair]), rationale }],
    })
    expect(exercise.steps[0]?.rationale).toEqual(rationale)
  })

  it("rejects a repair past the bounded-answer budget, and says why", () => {
    const tooLong: Block = {
      kind: "typing",
      source: "a".repeat(DIAGNOSTIC_REPAIR_MAX_CHARS + 1),
      language: "rust",
    }
    const result = DiagnosticStepSchema.safeParse({
      ...step([failure, tooLong]),
      rationale,
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toMatch(
      /runs past 50 typed characters/
    )
  })

  it("accepts a repair right at the bounded-answer budget", () => {
    const atLimit: Block = {
      kind: "typing",
      source: "a".repeat(DIAGNOSTIC_REPAIR_MAX_CHARS),
      language: "rust",
    }
    const result = DiagnosticStepSchema.safeParse({
      ...step([failure, atLimit]),
      rationale,
    })
    expect(result.success).toBe(true)
  })

  it("rejects a multi-line repair even when it is under the character budget", () => {
    const multiline: Block = {
      kind: "typing",
      source: "cursor += 1;\nlet done = true;",
      language: "rust",
    }
    const result = DiagnosticStepSchema.safeParse({
      ...step([failure, multiline]),
      rationale,
    })
    expect(result.success).toBe(false)
  })

  it("bounds only the typed portion of a repair framed with ‹context›", () => {
    // The gap this guards: a diagnostic step's frame legitimately spans
    // many lines of context around a short repair (LTY-FRAME's context
    // spans), and counting the whole source — frame included — would
    // reject exactly the shape the family is built on. A ~150-character
    // frame around a 12-character repair must still pass.
    const framed: Block = {
      kind: "typing",
      source:
        "‹while cursor < input.len() {\n    parse(input[cursor]);\n    ›cursor += 1;‹\n}›",
      language: "rust",
    }
    const result = DiagnosticStepSchema.safeParse({
      ...step([failure, framed]),
      rationale,
    })
    expect(result.success).toBe(true)
  })

  it("still rejects when the typed portion alone is over budget, context aside", () => {
    const framed: Block = {
      kind: "typing",
      source: `‹let x = ›${"a".repeat(DIAGNOSTIC_REPAIR_MAX_CHARS + 1)}‹;›`,
      language: "rust",
    }
    const result = DiagnosticStepSchema.safeParse({
      ...step([failure, framed]),
      rationale,
    })
    expect(result.success).toBe(false)
  })
})

describe("the view contract's extension point", () => {
  it("admits a new prompt-side kind without the typing path changing", () => {
    // The acceptance criterion, exercised rather than asserted: a future
    // `hint` block is a prompt-side addition. Until the union grows, the
    // demonstration is that the typing path reads *only* the typing block
    // and is indifferent to how many other blocks sit beside it. Two
    // one-line prompt blocks (rather than four) so the fixture itself stays
    // inside the step-level prose budget below.
    const many = StepSchema.parse(step([prompt, typing, prompt]))
    expect(typingBlockOf(many)).toEqual(typing)
    expect(languageOf(many)).toBe("rust")
  })
})
