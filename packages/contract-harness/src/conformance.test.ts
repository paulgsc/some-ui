import { describe, expect, it } from "vitest"
import { z } from "zod"

import { checkConformance } from "./conformance"

describe("checkConformance", () => {
  it("accepts a body that matches and reports nothing", () => {
    const schema = z.object({ id: z.number(), label: z.string() })
    const result = checkConformance(schema, { id: 1, label: "a" })

    expect(result.valid).toBe(true)
    expect(result.issues).toEqual([])
    expect(result.unknownFields).toEqual([])
    expect(result.phantomFields).toEqual([])
    expect(result.sampleCount).toBe(1)
  })

  it("reports a field the server sent that the schema does not declare", () => {
    const schema = z.object({ id: z.number() })
    const result = checkConformance(schema, { id: 1, added_by_server: "new" })

    // The load-bearing part: zod strips the key, so validation still passes.
    expect(result.valid).toBe(true)
    expect(result.unknownFields.map((field) => field.path)).toEqual([
      "added_by_server",
    ])
  })

  it("reports an optional field the server never sends", () => {
    const schema = z.object({ id: z.number(), time: z.string().optional() })
    const result = checkConformance(schema, { id: 1 })

    expect(result.valid).toBe(true)
    expect(result.phantomFields.map((field) => field.path)).toEqual(["time"])
  })

  it("does not call an optional field phantom when some values carry it", () => {
    const schema = z.array(
      z.object({ id: z.number(), time: z.string().optional() })
    )
    const result = checkConformance(schema, [{ id: 1 }, { id: 2, time: "now" }])

    expect(result.phantomFields).toEqual([])
  })

  it("calls it phantom only when absent from every element", () => {
    const schema = z.array(
      z.object({ id: z.number(), time: z.string().optional() })
    )
    const result = checkConformance(schema, [{ id: 1 }, { id: 2 }, { id: 3 }])

    expect(result.phantomFields).toHaveLength(1)
    expect(result.phantomFields[0]?.path).toBe("[].time")
    expect(result.phantomFields[0]?.samples).toBe(3)
  })

  it("reproduces the live MoodEvent drift", () => {
    // Exactly the client schema from use-hopium-queries.ts …
    const MoodEventSchema = z.object({
      id: z.number(),
      index: z.number(),
      week: z.number(),
      label: z.string(),
      description: z.string(),
      team: z.string(),
      category: z.string(),
      delta: z.number(),
      mood: z.number(),
      time: z.string().optional(),
    })

    // … against exactly what the server's MoodEvent serialises to.
    const fromServer = [
      {
        id: 1,
        index: 0,
        week: 3,
        label: "l",
        description: "d",
        team: "t",
        category: "c",
        delta: -2,
        mood: 4,
      },
    ]

    const result = checkConformance(z.array(MoodEventSchema), fromServer)

    expect(result.valid).toBe(true)
    expect(result.phantomFields.map((field) => field.path)).toEqual(["[].time"])
  })

  it("collapses array indices so a path is reported once, not per element", () => {
    const schema = z.array(z.object({ id: z.number() }))
    const result = checkConformance(schema, [
      { id: 1, extra: true },
      { id: 2, extra: true },
    ])

    expect(result.unknownFields).toHaveLength(1)
    expect(result.unknownFields[0]?.path).toBe("[].extra")
    expect(result.unknownFields[0]?.samples).toBe(2)
  })

  it("walks nested objects", () => {
    const schema = z.object({
      content: z.object({ title: z.string(), summary: z.string().optional() }),
    })
    const result = checkConformance(schema, {
      content: { title: "t", kind: "article" },
    })

    expect(result.unknownFields.map((field) => field.path)).toEqual([
      "content.kind",
    ])
    expect(result.phantomFields.map((field) => field.path)).toEqual([
      "content.summary",
    ])
  })

  it("sees through nullable and default wrappers", () => {
    const schema = z.object({
      a: z.string().nullable(),
      b: z.string().default("x"),
    })
    const result = checkConformance(schema, { a: null })

    expect(result.valid).toBe(true)
    // `b` has a default, so its absence is expected of the wire, not phantom-free
    expect(result.phantomFields.map((field) => field.path)).toEqual(["b"])
  })

  it("reports an empty collection as zero samples so it is not read as clean", () => {
    const schema = z.array(
      z.object({ id: z.number(), time: z.string().optional() })
    )
    const result = checkConformance(schema, [])

    expect(result.valid).toBe(true)
    expect(result.sampleCount).toBe(0)
    expect(result.phantomFields).toEqual([])
  })

  it("still surfaces unknown fields when validation fails, so a rename is legible", () => {
    const schema = z.object({ tab_id: z.number() })
    const result = checkConformance(schema, { tabId: 7 })

    expect(result.valid).toBe(false)
    expect(result.issues.join()).toContain("tab_id")
    expect(result.unknownFields.map((field) => field.path)).toEqual(["tabId"])
  })

  it("flags a type change that unit tests on either side would miss", () => {
    // The exact scenario from the design discussion: id goes number -> string.
    const schema = z.object({ id: z.number(), prompt: z.string() })
    const result = checkConformance(schema, { id: "123", prompt: "p" })

    expect(result.valid).toBe(false)
    expect(result.issues.join()).toContain("id")
  })

  it("does not audit record subtrees for unknown keys, and says so", () => {
    const schema = z.object({ meta: z.record(z.string(), z.unknown()) })
    const result = checkConformance(schema, { meta: { anything: 1, else: 2 } })

    expect(result.valid).toBe(true)
    expect(result.unknownFields).toEqual([])
    expect(result.opaqueSubtrees).toEqual(["meta"])
  })
})
