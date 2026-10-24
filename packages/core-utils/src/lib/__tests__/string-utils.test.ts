import { canonicalJson, mentionsWord } from "@core-utils/lib/string-utils"
import { describe, expect, it } from "vitest"

describe("mentionsWord", () => {
  it.each([
    ["the answer is three", "Three", true],
    ["13 nodes", "3", false],
    ["another option", "A", false],
    ["option A. holds", "A.", true],
    ["fsync before the OK", "fsync", true],
    ["a quorum-based read", "quorum", true],
    ["quorums", "quorum", false],
  ])("%j mentions %j: %s", (text, term, expected) => {
    expect(mentionsWord(text, term)).toBe(expected)
  })
})

describe("canonicalJson", () => {
  it("spells one value one way, whatever its key order", () => {
    expect(canonicalJson({ b: [1, { d: 2, c: "x" }], a: null })).toBe(
      canonicalJson({ a: null, b: [1, { c: "x", d: 2 }] })
    )
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}')
  })

  it("leaves undefined members out, and tells other values apart", () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe(canonicalJson({ a: 1 }))
    expect(canonicalJson({ a: 1 })).not.toBe(canonicalJson({ a: "1" }))
  })
})
