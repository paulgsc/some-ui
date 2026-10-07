/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it } from "vitest"

import {
  allReflections,
  readReflection,
  writeReflection,
} from "@/lib/session-reflection"

beforeEach(() => {
  localStorage.clear()
})

describe("session reflections", () => {
  it("reads back what was written, per session", () => {
    writeReflection("a", { worthwhile: "yes", difficulty: "too-hard" })
    writeReflection("b", { enthusiasm: "drained" })

    expect(readReflection("a")).toEqual({
      worthwhile: "yes",
      difficulty: "too-hard",
    })
    expect(readReflection("b")).toEqual({ enthusiasm: "drained" })
    expect(readReflection("c")).toEqual({})
    expect(allReflections()).toEqual([
      { sessionId: "b", answers: { enthusiasm: "drained" } },
      {
        sessionId: "a",
        answers: { worthwhile: "yes", difficulty: "too-hard" },
      },
    ])
  })

  it("drops an answer no question offers", () => {
    localStorage.setItem(
      "some-ui:session-reflections",
      JSON.stringify([{ id: "a", answers: { worthwhile: "maybe", pace: 1 } }])
    )
    expect(readReflection("a")).toEqual({})
  })
})
