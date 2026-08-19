import { ALL_FIXTURE_EXERCISES } from "@leetype/lib/leetype/exercises"
import type { ReadBlock } from "@leetype/types/exercise"
import { promptBlocksOf, StepSchema } from "@leetype/types/exercise"
import { describe, expect, it } from "vitest"

import type { EvidenceRow } from "./rows"
import { evidenceRowsOf } from "./rows"

const prompt: ReadBlock = {
  kind: "prompt",
  lines: ["First line.", "Second line."],
}
const transition: ReadBlock = {
  kind: "transition",
  label: "lookups",
  before: "2 lookups",
  after: "1 lookup",
}
const traceWithHeadline: ReadBlock = {
  kind: "trace",
  headline: "TIMEOUT",
  observations: [
    { label: "iterations", value: "10,000" },
    { label: "cursor", value: "0 → 0" },
  ],
}
const traceWithoutHeadline: ReadBlock = {
  kind: "trace",
  observations: [{ label: "cursor", value: "0 → 0" }],
}
const region: ReadBlock = {
  kind: "region",
  label: "the finalized prefix",
  startDisplay: 0,
  endDisplay: 12,
}

describe("evidenceRowsOf", () => {
  it("gives a prompt block one row per line", () => {
    const rows = evidenceRowsOf([prompt])
    expect(rows).toHaveLength(2)
    expect(rows.map((row) => row.kind)).toEqual(["prompt-line", "prompt-line"])
  })

  it("gives a transition block exactly one row", () => {
    const rows = evidenceRowsOf([transition])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      kind: "transition",
      label: "lookups",
      before: "2 lookups",
      after: "1 lookup",
    })
  })

  it("gives a trace block one row for its headline plus one per observation", () => {
    const rows = evidenceRowsOf([traceWithHeadline])
    expect(rows).toHaveLength(3)
    expect(rows.map((row) => row.kind)).toEqual([
      "trace-headline",
      "trace-observation",
      "trace-observation",
    ])
  })

  it("omits the headline row when a trace has none", () => {
    const rows = evidenceRowsOf([traceWithoutHeadline])
    expect(rows).toHaveLength(1)
    expect(rows[0]?.kind).toBe("trace-observation")
  })

  it("gives a region block exactly one row, carrying only its label", () => {
    const rows = evidenceRowsOf([region])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      kind: "region",
      label: "the finalized prefix",
    })
  })

  it("flattens a mix of kinds in order, and every row has a unique id", () => {
    const rows = evidenceRowsOf([prompt, transition, traceWithHeadline, region])
    expect(rows).toHaveLength(2 + 1 + 3 + 1)
    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length)
  })

  it("returns nothing for an empty block list", () => {
    expect(evidenceRowsOf([])).toEqual([])
  })
})

const KNOWN_ROW_KINDS: ReadonlySet<EvidenceRow["kind"]> = new Set([
  "prompt-line",
  "transition",
  "trace-headline",
  "trace-observation",
  "region",
])

describe("PromptPanel's inputs stay blind to patch overlays (LTY-PATCH P6, #1081)", () => {
  // The epic's own claim: "the prompt side does not move." evidenceRowsOf
  // operates on ReadBlock[] — promptBlocksOf's output, which filters the
  // typing block (and therefore `patch`) out before evidenceRowsOf ever
  // runs — so this file, EvidenceRow, and PromptPanel itself never gain a
  // word of hunk vocabulary. Checked here rather than by diffing this
  // file against a pre-epic revision, which a test suite cannot do
  // directly: the observable claim is that patch presence has zero
  // influence on what this module produces, which is exactly what these
  // tests exercise.

  it("evidenceRowsOf(promptBlocksOf(step)) is identical whether or not the typing block carries a patch", () => {
    const promptSideBlocks: Array<ReadBlock> = [
      { kind: "prompt", lines: ["Same prompt either way."] },
      {
        kind: "trace",
        headline: "TIMEOUT",
        observations: [{ label: "cursor", value: "0 → 0" }],
      },
    ]
    const withoutPatch = StepSchema.parse({
      id: "s1",
      goal: "Do the thing.",
      blocks: [
        ...promptSideBlocks,
        { kind: "typing", source: "let x = 1;", language: "rust" },
      ],
    })
    const withPatch = StepSchema.parse({
      id: "s2",
      goal: "Do the thing.",
      blocks: [
        ...promptSideBlocks,
        {
          kind: "typing",
          source: "let x = 1;",
          language: "rust",
          patch: {
            path: "src/example.rs",
            oldStart: 1,
            newStart: 1,
            lineKinds: ["add"],
          },
        },
      ],
    })

    expect(evidenceRowsOf(promptBlocksOf(withPatch))).toEqual(
      evidenceRowsOf(promptBlocksOf(withoutPatch))
    )
  })

  it("never produces a row kind outside the five EvidenceRow already closed on", () => {
    for (const exercise of ALL_FIXTURE_EXERCISES) {
      for (const step of exercise.steps) {
        for (const row of evidenceRowsOf(promptBlocksOf(step))) {
          expect(
            KNOWN_ROW_KINDS.has(row.kind),
            `step "${step.id}" produced an evidence row of kind "${row.kind}", ` +
              "outside EvidenceRow's five closed kinds — LTY-PATCH must not have added one."
          ).toBe(true)
        }
      }
    }
  })
})
