import type { ReadBlock } from "@leetype/types/exercise"
import { describe, expect, it } from "vitest"

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
