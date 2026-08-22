import { describe, expect, it } from "vitest"

import type { Block, DiffHunk, RationaleChoice } from "./exercise"
import {
  BlockSchema,
  ConstructionStepSchema,
  DIAGNOSTIC_REPAIR_MAX_CHARS,
  DiagnosticStepSchema,
  ExerciseSchema,
  GOAL_MAX_CHARS,
  languageOf,
  PROMPT_LINE_MAX_CHARS,
  PROMPT_MAX_LINES,
  PromptBlockSchema,
  promptBlocksOf,
  RATIONALE_CHOICES_MAX,
  RationaleChoiceSchema,
  RegionBlockSchema,
  renderedDiffLineKinds,
  StepSchema,
  TraceBlockSchema,
  TransitionBlockSchema,
  typingBlockFromDiff,
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

  it("keeps transferFrom optional and never needs it to render (LTY-SEAM S3, #1017)", () => {
    // The same pin `provenance` gets above: a step with the field set reads
    // through every render-facing helper identically to one without it —
    // proof the field is inert at runtime, not just documented as such.
    const withoutTransfer = StepSchema.parse(step([prompt, typing]))
    const withTransfer = StepSchema.parse({
      ...step([prompt, typing]),
      transferFrom: "entry-03-place",
    })
    expect(withTransfer.transferFrom).toBe("entry-03-place")
    expect(typingBlockOf(withTransfer)).toEqual(typingBlockOf(withoutTransfer))
    expect(promptBlocksOf(withTransfer)).toEqual(
      promptBlocksOf(withoutTransfer)
    )
    expect(languageOf(withTransfer)).toEqual(languageOf(withoutTransfer))
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

describe("StepObjectSchema — rationaleChoices (LTY-WHY W2, #1102)", () => {
  const choices: Array<RationaleChoice> = [
    { text: "Borrowing avoids the copy the earlier attempt paid for." },
    {
      text: "The iterator adaptor never allocates a second Vec.",
      canonical: true,
    },
  ]

  it("keeps rationaleChoices optional and a step without it renders identically", () => {
    const without = StepSchema.parse(step([prompt, typing]))
    const withChoices = StepSchema.parse({
      ...step([prompt, typing]),
      rationaleChoices: choices,
    })
    expect(withChoices.rationaleChoices).toEqual(choices)
    expect(typingBlockOf(withChoices)).toEqual(typingBlockOf(without))
    expect(promptBlocksOf(withChoices)).toEqual(promptBlocksOf(without))
    expect(languageOf(withChoices)).toEqual(languageOf(without))
  })

  it("keeps canonical optional and unread by anything outside the schema", () => {
    // The same pin `provenance`/`transferFrom` get: the field round-trips
    // through the schema and nothing in this module's public surface
    // (typingBlockOf/promptBlocksOf/languageOf) branches on it.
    const parsed = StepSchema.parse({
      ...step([prompt, typing]),
      rationaleChoices: choices,
    })
    expect(parsed.rationaleChoices?.[0]?.canonical).toBeUndefined()
    expect(parsed.rationaleChoices?.[1]?.canonical).toBe(true)
  })

  it("rejects a single candidate — one candidate is not a choice", () => {
    const result = StepSchema.safeParse({
      ...step([prompt, typing]),
      rationaleChoices: [{ text: "only one" }],
    })
    expect(result.success).toBe(false)
  })

  it(`rejects more than ${RATIONALE_CHOICES_MAX} candidates`, () => {
    const tooMany: Array<RationaleChoice> = Array.from(
      { length: RATIONALE_CHOICES_MAX + 1 },
      (_, i) => ({ text: `candidate ${i}` })
    )
    const result = StepSchema.safeParse({
      ...step([prompt, typing]),
      rationaleChoices: tooMany,
    })
    expect(result.success).toBe(false)
  })

  it("rejects an empty candidate string", () => {
    expect(RationaleChoiceSchema.safeParse({ text: "" }).success).toBe(false)
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

  it("rejects an over-budget prompt on a diff-shaped step exactly as it would on any other (LTY-PATCH)", () => {
    // "No diff-shaped exemption anywhere": isWithinStepPromptBudget reads
    // step.blocks, never diff, so there is no code path for an exemption
    // to hide in — but the epic's own safety claim asks for this proven,
    // not inferred from reading the implementation.
    const overBudget: Block = {
      kind: "prompt",
      lines: Array(PROMPT_MAX_LINES + 1).fill("A short line."),
    }
    const diffTyping: Block = typingBlockFromDiff({
      language: "rust",
      path: "src/example.rs",
      oldStart: 1,
      newStart: 1,
      segments: [{ kind: "addition", text: "add_this();" }],
    })
    const result = StepSchema.safeParse(step([overBudget, diffTyping]))
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toMatch(/more than 2 lines/)
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

  it("leaves TypingBlockSchema untouched by the new evidence kinds", () => {
    expect(TypingBlockSchema.safeParse(typing).success).toBe(true)
    // The typing path never grows a case for prompt/transition/trace/region
    // — its shape is exactly kind/source/language plus LTY-PATCH's own
    // optional `diff` overlay, nothing an evidence kind added.
    expect(Object.keys(TypingBlockSchema.shape).sort()).toEqual(
      ["diff", "kind", "language", "source"].sort()
    )
  })
})

describe("TypingBlockSchema — the diff overlay (LTY-PATCH)", () => {
  const fourLineDiff: DiffHunk = {
    path: "src/lib/rate-limit.ts",
    oldStart: 12,
    newStart: 12,
    segments: [
      { kind: "context", text: "line1\n" },
      { kind: "deletion", text: "line2\n" },
      { kind: "addition", text: "line3" },
      { kind: "context", text: "\nline4" },
    ],
  }
  const fourLineTyping = typingBlockFromDiff({
    language: "rust",
    ...fourLineDiff,
  })

  it("keeps diff optional and never needs it to render", () => {
    const plain: Block = {
      kind: "typing",
      source: fourLineTyping.source,
      language: "rust",
    }
    const withoutDiff = StepSchema.parse(step([prompt, plain]))
    const withDiff = StepSchema.parse({
      ...step([prompt, plain]),
      blocks: [prompt, fourLineTyping],
    })
    expect(typingBlockOf(withDiff)?.diff).toEqual(fourLineDiff)
    expect(promptBlocksOf(withDiff)).toEqual(promptBlocksOf(withoutDiff))
    expect(languageOf(withDiff)).toEqual(languageOf(withoutDiff))
  })

  it("accepts a diff whose source matches what its segments derive", () => {
    const withDiff = step([prompt, fourLineTyping])
    expect(StepSchema.safeParse(withDiff).success).toBe(true)
  })

  it("derives rendered line kinds matching the segments' own kinds", () => {
    expect(renderedDiffLineKinds(fourLineDiff)).toEqual([
      "context",
      "del",
      "add",
      "context",
    ])
  })

  it("rejects a source that disagrees with what its diff's segments derive, and says why", () => {
    const mismatched: Block = {
      kind: "typing",
      source: `${fourLineTyping.source} `, // one stray character
      language: "rust",
      diff: fourLineDiff,
    }
    const result = StepSchema.safeParse(step([prompt, mismatched]))
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toMatch(
      /source does not match the string its diff overlay/
    )
  })

  it("requires at least one segment", () => {
    const withEmptySegments = {
      kind: "typing",
      source: "let x = 1;",
      language: "rust",
      diff: { ...fourLineDiff, segments: [] },
    }
    expect(TypingBlockSchema.safeParse(withEmptySegments).success).toBe(false)
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

  describe("the repair bound under a diff overlay (LTY-PATCH P4, #1079)", () => {
    // A hunk decouples "one line" from "one locus": a diff-shaped repair
    // may span several lines as long as its rendered `add` lines form one
    // contiguous run — contiguity substitutes for the line rule entirely,
    // per the doc comment on DIAGNOSTIC_REPAIR_MAX_CHARS.

    it("accepts a multi-line diff repair whose add lines are one contiguous run", () => {
      const guardClause = typingBlockFromDiff({
        language: "rust",
        path: "src/stats/average.rs",
        oldStart: 1,
        newStart: 1,
        segments: [
          {
            kind: "context",
            text: "fn average(total: i32, count: i32) -> i32 {\n    ",
          },
          {
            kind: "addition",
            text: "if count == 0 {\n        return 0;\n    }",
          },
          { kind: "context", text: "\n    total / count\n}" },
        ],
      })
      const result = DiagnosticStepSchema.safeParse({
        ...step([failure, guardClause]),
        rationale,
      })
      expect(result.success).toBe(true)
    })

    it("measures keystrokes, not raw characters — indentation and newlines don't inflate the budget", () => {
      // Regression for a review finding on this story: a repair's raw
      // character count includes layout (leading indentation, newlines)
      // the player never presses a key for (Role::Skip). Four lines
      // indented 12 spaces each run to 67 raw characters — over budget if
      // measured naively — but only 16 actual keystrokes once indentation
      // and newlines are excluded, comfortably inside it.
      const indentedLine = "            x();" // 12 spaces + typed "x();"
      const source = Array(4).fill(indentedLine).join("\n")
      expect(source.length).toBeGreaterThan(DIAGNOSTIC_REPAIR_MAX_CHARS)
      const heavilyIndented = typingBlockFromDiff({
        language: "rust",
        path: "src/example.rs",
        oldStart: 1,
        newStart: 1,
        segments: [{ kind: "addition", text: source }],
      })
      const result = DiagnosticStepSchema.safeParse({
        ...step([failure, heavilyIndented]),
        rationale,
      })
      expect(result.success).toBe(true)
    })

    it("rejects a diff repair whose add lines split into two runs, and says why", () => {
      // Two separate runs is two faults wearing one hunk — the exact shape
      // "one fault, one edit" (constraint 1) exists to rule out, now
      // mechanically checkable because rendered line kinds are derived from
      // authored segments.
      const twoFaults = typingBlockFromDiff({
        language: "rust",
        path: "src/example.rs",
        oldStart: 1,
        newStart: 1,
        segments: [
          { kind: "addition", text: "line1" },
          { kind: "context", text: "\nline2\n" },
          { kind: "addition", text: "line3" },
          { kind: "context", text: "\nline4\nline5" },
        ],
      })
      const result = DiagnosticStepSchema.safeParse({
        ...step([failure, twoFaults]),
        rationale,
      })
      expect(result.success).toBe(false)
      expect(result.error?.issues[0]?.message).toMatch(
        /not one contiguous locus/
      )
    })

    it("still rejects a diff repair that clears contiguity but not the character budget", () => {
      const oversized = typingBlockFromDiff({
        language: "rust",
        path: "src/example.rs",
        oldStart: 1,
        newStart: 1,
        segments: [
          {
            kind: "addition",
            text: "a".repeat(DIAGNOSTIC_REPAIR_MAX_CHARS + 1),
          },
        ],
      })
      const result = DiagnosticStepSchema.safeParse({
        ...step([failure, oversized]),
        rationale,
      })
      expect(result.success).toBe(false)
      expect(result.error?.issues[0]?.message).toMatch(
        /runs past 50 typed characters/
      )
    })

    it("accepts a diff repair with no add lines at all (0 runs is at most 1)", () => {
      const noAddLines = typingBlockFromDiff({
        language: "rust",
        path: "src/example.rs",
        oldStart: 1,
        newStart: 1,
        segments: [
          { kind: "context", text: "line1\n" },
          { kind: "deletion", text: "line2" },
        ],
      })
      const result = DiagnosticStepSchema.safeParse({
        ...step([failure, noAddLines]),
        rationale,
      })
      expect(result.success).toBe(true)
    })
  })
})

describe("ConstructionStepSchema — the obligation→witness family", () => {
  const constraint: Block = {
    kind: "trace",
    headline: "hash ops",
    observations: [{ label: "naive", value: "2" }],
  }
  const witness: Block = {
    kind: "typing",
    source: "map.entry(key)",
    language: "rust",
  }
  const obligation = "a lookup can be held as a place, not a value"

  it("keeps obligation optional on the plain StepSchema", () => {
    const parsed = StepSchema.parse(step([constraint, witness]))
    expect(parsed.obligation).toBeUndefined()
  })

  it("rejects a construction step with no obligation, at the obligation path", () => {
    const result = ConstructionStepSchema.safeParse(step([constraint, witness]))
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual(["obligation"])
  })

  it("rejects a construction step whose only block is its witness, and says why", () => {
    const result = ConstructionStepSchema.safeParse({
      ...step([witness]),
      obligation,
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toMatch(
      /at least one block besides its witness/
    )
  })

  it("accepts a construction step with an obligation and a visible constraint", () => {
    const result = ConstructionStepSchema.safeParse({
      ...step([constraint, witness]),
      obligation,
    })
    expect(result.success).toBe(true)
  })

  it("preserves obligation through the generic StepSchema/ExerciseSchema parse", () => {
    // Same regression class as rationale: the shim's `ExerciseCorpusSchema.parse`
    // uses the generic `StepSchema`, not `ConstructionStepSchema`, so an
    // authored obligation must survive that parse rather than being
    // stripped as an unrecognized key.
    const exercise = ExerciseSchema.parse({
      id: "e1",
      title: "Construction fixture",
      steps: [{ ...step([constraint, witness]), obligation }],
    })
    expect(exercise.steps[0]?.obligation).toBe(obligation)
  })

  it("ships no assumes, difficulty or level field", () => {
    const parsed = ConstructionStepSchema.parse({
      ...step([constraint, witness]),
      obligation,
    })
    expect(parsed).not.toHaveProperty("assumes")
    expect(parsed).not.toHaveProperty("difficulty")
    expect(parsed).not.toHaveProperty("level")
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
