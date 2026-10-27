import { isRecord } from "@core-utils/lib/is-record"
import { describe, expect, it } from "vitest"

describe("isRecord", () => {
  it.each([{}, { a: 1 }])("accepts an object: %j", (value) => {
    expect(isRecord(value)).toBe(true)
  })

  it.each([
    { value: [] },
    { value: null },
    { value: undefined },
    { value: "x" },
    { value: 1 },
    { value: true },
  ])("rejects $value", ({ value }) => {
    expect(isRecord(value)).toBe(false)
  })
})
