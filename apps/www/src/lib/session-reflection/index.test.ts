/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it } from "vitest"

import {
  readReflection,
  REFLECTION_LIMIT,
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
  })

  it("keeps only the latest sessions' answers", () => {
    for (let i = 0; i <= REFLECTION_LIMIT; i++) {
      writeReflection(`s${i}`, { worthwhile: "yes" })
    }

    expect(readReflection("s0")).toEqual({})
    expect(readReflection(`s${REFLECTION_LIMIT}`)).toEqual({
      worthwhile: "yes",
    })
    const stored: unknown = JSON.parse(
      localStorage.getItem("some-ui:session-reflections") ?? "[]"
    )
    expect(Array.isArray(stored) && stored.length).toBe(REFLECTION_LIMIT)
  })

  it("reads anything it cannot use as no answers", () => {
    localStorage.setItem("some-ui:session-reflections", "{not json")
    expect(readReflection("a")).toEqual({})

    localStorage.setItem(
      "some-ui:session-reflections",
      JSON.stringify([{ id: "a", answers: { worthwhile: "maybe", pace: 1 } }])
    )
    expect(readReflection("a")).toEqual({})
  })
})
