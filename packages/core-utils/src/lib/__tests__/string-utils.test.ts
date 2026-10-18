import { mentionsWord } from "@core-utils/lib/string-utils"
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
