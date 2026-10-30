/** @vitest-environment node */
import { sceneLine, WORDS } from "@burn-ins/lib/words"
import { describe, expect, it } from "vitest"

/** How it works rather than what it does: none of this reaches the page. */
const MACHINERY =
  /\b(cue|cues|frame|ms|px|srt|subrip|token|state|null|undefined|theme|render\w*|safe area|timestamp\w*)\b/i

const strings = (value: unknown): Array<string> => {
  if (typeof value === "string") return [value]
  if (typeof value === "function") {
    const out: unknown = value(1500, 12_000)
    return strings(out)
  }
  if (typeof value === "object" && value !== null)
    return Object.values(value).flatMap(strings)
  return []
}

describe("the preview page's words", () => {
  it("say what each one looks like, never the machinery", () => {
    const all = strings(WORDS)
    expect(all.length).toBeGreaterThan(10)
    expect(all.filter((s) => MACHINERY.test(s))).toEqual([])
  })

  it("say a scene's record in words, never the machinery", () => {
    const lines = [
      sceneLine(1, { origin: "you", wording: "you", hands: ["you", "code"] }),
      sceneLine(2, { origin: "source", wording: "agent", hands: [] }),
      sceneLine(3, {
        origin: "agent",
        wording: "agent",
        hands: ["you", "agent", "code"],
      }),
    ]
    expect(lines).toEqual([
      "Scene 1: my idea, my words, made by me and code.",
      "Scene 2: a source's idea, Claude's words, no hands named.",
      "Scene 3: Claude's idea, Claude's words, made by me, Claude and code.",
    ])
  })

  it("give the time in seconds", () => {
    expect(WORDS.time(1500, 12_000)).toBe("1.5 of 12.0 seconds")
  })
})
