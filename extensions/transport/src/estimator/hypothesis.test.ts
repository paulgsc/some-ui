import { describe, expect, it } from "vitest"

import { createHypothesis } from "./hypothesis"

type Attrs = { readonly dismissed: boolean }

describe("estimator/hypothesis", () => {
  it("has() is false and get() is undefined for a key with no evidence yet (⊥)", () => {
    const h = createHypothesis<string, Attrs>()
    expect(h.has("k")).toBe(false)
    expect(h.get("k")).toBeUndefined()
  })

  it("set() makes has()/get() agree", () => {
    const h = createHypothesis<string, Attrs>()
    h.set("k", { dismissed: true })
    expect(h.has("k")).toBe(true)
    expect(h.get("k")).toEqual({ dismissed: true })
  })

  it("delete() restores ⊥", () => {
    const h = createHypothesis<string, Attrs>()
    h.set("k", { dismissed: true })
    h.delete("k")
    expect(h.has("k")).toBe(false)
    expect(h.get("k")).toBeUndefined()
  })

  it("keys() enumerates only keys with evidence", () => {
    const h = createHypothesis<string, Attrs>()
    h.set("a", { dismissed: true })
    h.set("b", { dismissed: false })
    expect(new Set(h.keys())).toEqual(new Set(["a", "b"]))
  })
})
