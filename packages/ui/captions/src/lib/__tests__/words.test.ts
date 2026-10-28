/** @vitest-environment node */
import { WORDS } from "@captions/lib/words"
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
  it("say what the subtitles look like, never the machinery", () => {
    const all = strings(WORDS)
    expect(all.length).toBeGreaterThan(10)
    expect(all.filter((s) => MACHINERY.test(s))).toEqual([])
  })

  it("give the time in seconds", () => {
    expect(WORDS.time(1500, 12_000)).toBe("1.5 of 12.0 seconds")
  })
})
