import { describe, expect, it } from "vitest"

import { ProbeSchema, TopikFileSchema } from "./topik-types"

const option = (
  text: string,
  valid: boolean
): { text: string; relation: "past"; valid: boolean; why: string } => ({
  text,
  relation: "past",
  valid,
  why: "because",
})

const oddOneOut = {
  id: "p1",
  kind: "odd-one-out",
  order: 2,
  prompt: "Which is NOT a valid transformation?",
  options: [option("a", true), option("b", true), option("c", false)],
}

describe("ProbeSchema", () => {
  it("accepts an odd-one-out with exactly one invalid option", () => {
    expect(ProbeSchema.safeParse(oddOneOut).success).toBe(true)
  })

  it("rejects an odd-one-out with no invalid option, or two", () => {
    const none = {
      ...oddOneOut,
      options: [option("a", true), option("b", true), option("c", true)],
    }
    const two = {
      ...oddOneOut,
      options: [option("a", true), option("b", false), option("c", false)],
    }
    expect(ProbeSchema.safeParse(none).success).toBe(false)
    expect(ProbeSchema.safeParse(two).success).toBe(false)
  })

  it("rejects a pick-valid without exactly one valid option", () => {
    const probe = {
      ...oddOneOut,
      kind: "pick-valid",
      options: [option("a", true), option("b", true)],
    }
    expect(ProbeSchema.safeParse(probe).success).toBe(false)
  })

  it("has no build kind: a choice needs candidates", () => {
    const build = {
      id: "b",
      kind: "build",
      order: 2,
      prompt: "Make it past",
      relation: "past",
      target: "했어요",
    }
    expect(ProbeSchema.safeParse(build).success).toBe(false)
  })

  it("takes any relation its author names, and refuses only a blank one (canon Rem. 4.8)", () => {
    const named = (relation: string): boolean =>
      ProbeSchema.safeParse({
        ...oddOneOut,
        options: [
          { ...option("a", true), relation: "reason: -아서 → -(으)니까" },
          { ...option("b", true), relation: "reported speech" },
          { ...option("c", false), relation },
        ],
      }).success
    expect(named("condition: -(으)면")).toBe(true)
    expect(named("  ")).toBe(false)
  })
})

describe("TopikFileSchema", () => {
  it("loads a file whose conversations still carry probes, without them", () => {
    const [parsed] = TopikFileSchema.parse([
      { id: 1, messages: [], questions: [], probes: [oddOneOut, 42] },
    ])
    expect(parsed).toEqual({ id: 1, messages: [], questions: [] })
  })
})
