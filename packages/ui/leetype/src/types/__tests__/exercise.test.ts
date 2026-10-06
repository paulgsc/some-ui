import type {
  Block,
  DiffHunk,
  DiffSegment,
  RationaleChoice,
} from "@leetype/types/exercise"
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
} from "@leetype/types/exercise"
import { describe, expect, it } from "vitest"
import type { ZodTypeAny } from "zod"

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

/** An unvalidated step candidate: the loose shapes a host-supplied corpus can produce. */
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

function linesBlock(count: number, line = "A short line."): Block {
  return { kind: "prompt", lines: Array<string>(count).fill(line) }
}

function diffTyping(segments: Array<DiffSegment>): Block {
  return typingBlockFromDiff({
    language: "rust",
    path: "src/example.rs",
    oldStart: 1,
    newStart: 1,
    segments,
  })
}

type ParseResult = ReturnType<ZodTypeAny["safeParse"]>

/** Asserts a failed parse whose first issue matches every pattern. */
function expectRejected(
  result: ParseResult,
  messages: ReadonlyArray<RegExp> = []
): void {
  expect(result.success).toBe(false)
  for (const message of messages) {
    expect(result.error?.issues[0]?.message).toMatch(message)
  }
}

describe("StepSchema", () => {
  it("accepts n prompt blocks and exactly one typing block", () => {
    const parsed = StepSchema.parse(step([prompt, prompt, typing]))
    expect(parsed.blocks).toHaveLength(3)
    expect(parsed.concepts).toEqual([])
  })

  it("accepts several prompt blocks whose combined lines stay in budget", () => {
    const oneLineBlock: Block = { kind: "prompt", lines: ["A short line."] }
    const stacked = step([oneLineBlock, oneLineBlock, typing])
    expect(StepSchema.safeParse(stacked).success).toBe(true)
  })

  it.each<{
    name: string
    candidate: StepCandidate
    messages?: ReadonlyArray<RegExp>
  }>([
    {
      // The message must say splitting the step is the fix, not just that a count was off.
      name: "two typing blocks, and says why",
      candidate: step([prompt, typing, typing]),
      messages: [/exactly one typing block/, /Split the step/],
    },
    {
      name: "no typing block",
      candidate: step([prompt]),
      messages: [/exactly one typing block/],
    },
    {
      name: "a goal longer than a sentence",
      candidate: {
        ...step([prompt, typing]),
        goal: "a".repeat(GOAL_MAX_CHARS + 1),
      },
    },
    {
      name: "an empty typing source",
      candidate: step([{ kind: "typing", source: "", language: "rust" }]),
    },
    {
      // Each block alone is on budget; stacked they are not.
      name: "several on-budget prompt blocks that are over budget combined",
      candidate: step([linesBlock(2), linesBlock(2), typing]),
      messages: [/combined/, /split the step/i],
    },
  ])("rejects a step with $name", ({ candidate, messages }) => {
    expectRejected(StepSchema.safeParse(candidate), messages)
  })
})

describe("inert optional step fields never change what renders", () => {
  const choices: Array<RationaleChoice> = [
    { text: "Borrowing avoids the copy the earlier attempt paid for." },
    {
      text: "The iterator adaptor never allocates a second Vec.",
      canonical: true,
    },
  ]

  it.each<{ field: string; value: unknown }>([
    {
      field: "provenance",
      value: { source: "pnpm", locator: "src/resolve.ts" },
    },
    { field: "transferFrom", value: "entry-03-place" },
    { field: "rationaleChoices", value: choices },
  ])("keeps $field optional and reads identically", ({ field, value }) => {
    const without = StepSchema.parse(step([prompt, typing]))
    const withField = StepSchema.parse({
      ...step([prompt, typing]),
      [field]: value,
    })
    expect(Reflect.get(withField, field)).toEqual(value)
    expect(typingBlockOf(withField)).toEqual(typing)
    expect(typingBlockOf(withField)).toEqual(typingBlockOf(without))
    expect(promptBlocksOf(withField)).toEqual(promptBlocksOf(without))
    expect(languageOf(withField)).toEqual(languageOf(without))
  })

  it("keeps canonical optional on each rationale choice", () => {
    const parsed = StepSchema.parse({
      ...step([prompt, typing]),
      rationaleChoices: choices,
    })
    expect(parsed.rationaleChoices?.[0]?.canonical).toBeUndefined()
    expect(parsed.rationaleChoices?.[1]?.canonical).toBe(true)
  })
})

describe("StepObjectSchema — rationaleChoices bounds", () => {
  it.each<{ name: string; rationaleChoices: Array<RationaleChoice> }>([
    {
      name: "a single candidate (one candidate is not a choice)",
      rationaleChoices: [{ text: "only one" }],
    },
    {
      name: `more than ${RATIONALE_CHOICES_MAX} candidates`,
      rationaleChoices: Array.from(
        { length: RATIONALE_CHOICES_MAX + 1 },
        (_, i) => ({ text: `candidate ${i}` })
      ),
    },
  ])("rejects $name", ({ rationaleChoices }) => {
    const result = StepSchema.safeParse({
      ...step([prompt, typing]),
      rationaleChoices,
    })
    expect(result.success).toBe(false)
  })

  it("rejects an empty candidate string", () => {
    expect(RationaleChoiceSchema.safeParse({ text: "" }).success).toBe(false)
  })
})

describe("PromptBlockSchema — the prose budget", () => {
  it.each([
    ["at the line limit", linesBlock(PROMPT_MAX_LINES)],
    [
      "with a line right at the per-line budget",
      linesBlock(1, "a".repeat(PROMPT_LINE_MAX_CHARS)),
    ],
  ])("accepts a prompt %s", (_name, block) => {
    expect(PromptBlockSchema.safeParse(block).success).toBe(true)
  })

  it.each([
    {
      name: "more lines than the budget",
      block: linesBlock(PROMPT_MAX_LINES + 1),
      messages: [/more than 2 lines/, /Split the step/],
    },
    {
      name: "a line longer than the per-line budget",
      block: linesBlock(1, "a".repeat(PROMPT_LINE_MAX_CHARS + 1)),
      messages: [/past 120 characters/, /pointer, not a paragraph/],
    },
  ])("rejects a prompt with $name, and says why", ({ block, messages }) => {
    expectRejected(PromptBlockSchema.safeParse(block), messages)
  })

  it("rejects an over-budget prompt on a diff-shaped step exactly as on any other (LTY-PATCH)", () => {
    const result = StepSchema.safeParse(
      step([
        linesBlock(PROMPT_MAX_LINES + 1),
        diffTyping([{ kind: "addition", text: "add_this();" }]),
      ])
    )
    expectRejected(result, [/more than 2 lines/])
  })
})

describe("the evidence block kinds", () => {
  it.each<[string, ZodTypeAny, unknown]>([
    ["a transition with its label", TransitionBlockSchema, transition],
    [
      "a transition without its label",
      TransitionBlockSchema,
      { kind: "transition", before: "2 lookups", after: "1 lookup" },
    ],
    ["a trace with its headline", TraceBlockSchema, trace],
    [
      "a trace without its headline",
      TraceBlockSchema,
      { kind: "trace", observations: [{ label: "cursor", value: "0 → 0" }] },
    ],
    ["a region whose end comes after its start", RegionBlockSchema, region],
  ])("accepts %s", (_name, schema, block) => {
    expect(schema.safeParse(block).success).toBe(true)
  })

  it.each<[string, ZodTypeAny, unknown, ReadonlyArray<RegExp>]>([
    [
      "a transition missing either side of the pair",
      TransitionBlockSchema,
      { kind: "transition", before: "x" },
      [],
    ],
    [
      "a trace with no observation",
      TraceBlockSchema,
      { kind: "trace", observations: [] },
      [],
    ],
    [
      "a region whose end does not come after its start, and says why",
      RegionBlockSchema,
      { kind: "region", label: "x", startDisplay: 5, endDisplay: 5 },
      [/end must come after/],
    ],
  ])("rejects %s", (_name, schema, block, messages) => {
    expectRejected(schema.safeParse(block), messages)
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
    // typing.source is 30 chars; a span to 100 is past it whatever the engine renders.
    const outOfRange: Block = {
      kind: "region",
      label: "past the end",
      startDisplay: 5,
      endDisplay: 100,
    }
    expectRejected(StepSchema.safeParse(step([outOfRange, typing])), [
      /reaches past/,
    ])
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

  it("leaves TypingBlockSchema untouched by the evidence kinds", () => {
    expect(TypingBlockSchema.safeParse(typing).success).toBe(true)
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
    const withDiff = StepSchema.parse(step([prompt, fourLineTyping]))
    expect(typingBlockOf(withDiff)?.diff).toEqual(fourLineDiff)
    expect(promptBlocksOf(withDiff)).toEqual(promptBlocksOf(withoutDiff))
    expect(languageOf(withDiff)).toEqual(languageOf(withoutDiff))
  })

  it("accepts a diff whose source matches what its segments derive", () => {
    expect(StepSchema.safeParse(step([prompt, fourLineTyping])).success).toBe(
      true
    )
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
    expectRejected(StepSchema.safeParse(step([prompt, mismatched])), [
      /source does not match the string its diff overlay/,
    ])
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
    const malformed = { id: "x", goal: "g", blocks: [prompt], concepts: [] }
    expect(typingBlockOf(malformed)).toBeUndefined()
    expect(languageOf(malformed)).toBe("rust")
    expect(promptBlocksOf(malformed)).toEqual([prompt])
  })

  it("separates what is read from what is typed, whatever sits beside the typing block", () => {
    const parsed = StepSchema.parse(step([prompt, typing, prompt]))
    expect(promptBlocksOf(parsed)).toHaveLength(2)
    expect(typingBlockOf(parsed)?.source).toBe(typing.source)
    expect(typingBlockOf(parsed)).toEqual(typing)
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
  const rustTyping = (source: string): Block => ({
    kind: "typing",
    source,
    language: "rust",
  })
  const parseDiagnostic = (blocks: Array<Block>): ParseResult =>
    DiagnosticStepSchema.safeParse({ ...step(blocks), rationale })

  it("keeps rationale optional on the plain StepSchema", () => {
    const parsed = StepSchema.parse(step([failure, shortRepair]))
    expect(parsed.rationale).toBeUndefined()
  })

  it("rejects a diagnostic step with no rationale, at the rationale path", () => {
    const result = DiagnosticStepSchema.safeParse(step([failure, shortRepair]))
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual(["rationale"])
  })

  it("preserves rationale through the generic StepSchema/ExerciseSchema parse", () => {
    // The corpus lint depends on this: the shim parses seeds through the
    // generic `ExerciseCorpusSchema`, which must not strip `rationale`.
    const exercise = ExerciseSchema.parse({
      id: "e1",
      title: "Diagnostic fixture",
      steps: [{ ...step([failure, shortRepair]), rationale }],
    })
    expect(exercise.steps[0]?.rationale).toEqual(rationale)
  })

  it.each<[string, Block]>([
    ["a short repair with its rationale and trace block", shortRepair],
    [
      "a repair right at the bounded-answer budget",
      rustTyping("a".repeat(DIAGNOSTIC_REPAIR_MAX_CHARS)),
    ],
    [
      // ~150 characters of frame around a 12-character repair: only the typed portion counts.
      "a repair framed with ‹context›, bounding only the typed portion",
      rustTyping(
        "‹while cursor < input.len() {\n    parse(input[cursor]);\n    ›cursor += 1;‹\n}›"
      ),
    ],
    [
      "a multi-line diff repair whose add lines are one contiguous run",
      typingBlockFromDiff({
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
      }),
    ],
    [
      "a diff repair with no add lines at all (0 runs is at most 1)",
      diffTyping([
        { kind: "context", text: "line1\n" },
        { kind: "deletion", text: "line2" },
      ]),
    ],
  ])("accepts %s", (_name, repair) => {
    expect(parseDiagnostic([failure, repair]).success).toBe(true)
  })

  it("measures keystrokes, not raw characters — indentation and newlines don't inflate the budget", () => {
    // 67 raw characters, but only 16 keystrokes: indentation and newlines are Role::Skip.
    const indentedLine = "            x();" // 12 spaces + typed "x();"
    const source = Array(4).fill(indentedLine).join("\n")
    expect(source.length).toBeGreaterThan(DIAGNOSTIC_REPAIR_MAX_CHARS)
    const heavilyIndented = diffTyping([{ kind: "addition", text: source }])
    expect(parseDiagnostic([failure, heavilyIndented]).success).toBe(true)
  })

  it.each<[string, Array<Block>, ReadonlyArray<RegExp>]>([
    [
      "with no trace block, and says why",
      [shortRepair],
      [/must carry a trace block/],
    ],
    [
      "a repair past the bounded-answer budget, and says why",
      [failure, rustTyping("a".repeat(DIAGNOSTIC_REPAIR_MAX_CHARS + 1))],
      [/runs past 50 typed characters/],
    ],
    [
      "a multi-line repair even when it is under the character budget",
      [failure, rustTyping("cursor += 1;\nlet done = true;")],
      [],
    ],
    [
      "when the typed portion alone is over budget, context aside",
      [
        failure,
        rustTyping(
          `‹let x = ›${"a".repeat(DIAGNOSTIC_REPAIR_MAX_CHARS + 1)}‹;›`
        ),
      ],
      [],
    ],
    [
      // Two runs of add lines is two faults wearing one hunk (constraint 1).
      "a diff repair whose add lines split into two runs, and says why",
      [
        failure,
        diffTyping([
          { kind: "addition", text: "line1" },
          { kind: "context", text: "\nline2\n" },
          { kind: "addition", text: "line3" },
          { kind: "context", text: "\nline4\nline5" },
        ]),
      ],
      [/not one contiguous locus/],
    ],
    [
      "a diff repair that clears contiguity but not the character budget",
      [
        failure,
        diffTyping([
          {
            kind: "addition",
            text: "a".repeat(DIAGNOSTIC_REPAIR_MAX_CHARS + 1),
          },
        ]),
      ],
      [/runs past 50 typed characters/],
    ],
  ])("rejects %s", (_name, blocks, messages) => {
    expectRejected(parseDiagnostic(blocks), messages)
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
    expectRejected(
      ConstructionStepSchema.safeParse({ ...step([witness]), obligation }),
      [/at least one block besides its witness/]
    )
  })

  it("accepts a construction step with an obligation and a visible constraint, shipping no assumes, difficulty or level field", () => {
    const candidate = { ...step([constraint, witness]), obligation }
    expect(ConstructionStepSchema.safeParse(candidate).success).toBe(true)
    const parsed = ConstructionStepSchema.parse(candidate)
    expect(parsed).not.toHaveProperty("assumes")
    expect(parsed).not.toHaveProperty("difficulty")
    expect(parsed).not.toHaveProperty("level")
  })

  it("preserves obligation through the generic StepSchema/ExerciseSchema parse", () => {
    const exercise = ExerciseSchema.parse({
      id: "e1",
      title: "Construction fixture",
      steps: [{ ...step([constraint, witness]), obligation }],
    })
    expect(exercise.steps[0]?.obligation).toBe(obligation)
  })
})
