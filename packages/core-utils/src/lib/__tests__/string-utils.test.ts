import {
  canonicalJson,
  listed,
  mentionsWord,
  ordinal,
} from "@core-utils/lib/string-utils"
import { describe, expect, it } from "vitest"

describe("listed", () => {
  it.each([
    [[], ""],
    [["a"], "a"],
    [["a", "b"], "a and b"],
    [["a", "b", "c"], "a, b and c"],
  ])("lists %j as %j", (items, said) => {
    expect(listed(items)).toBe(said)
  })
})

describe("ordinal", () => {
  it("places a number as it is read", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal)).toEqual(
      [
        "1st",
        "2nd",
        "3rd",
        "4th",
        "11th",
        "12th",
        "13th",
        "21st",
        "22nd",
        "23rd",
        "101st",
        "111th",
      ]
    )
  })
})

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

  it("leaves undefined members out", () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe(canonicalJson({ a: 1 }))
  })
})
