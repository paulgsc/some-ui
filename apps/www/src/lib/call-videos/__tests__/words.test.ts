/**
 * @vitest-environment node
 *
 * Everything Studio's Calls says is in the person's terms (CLAUDE.md, "State
 * in the person's terms"): none of it names the machinery behind it.
 */
import { describe, expect, it } from "vitest"

import { CALLS_WORDS, share } from "@/lib/call-videos/words"
import { MACHINERY } from "@/lib/home-link/__tests__/machinery"

function strings(value: unknown): Array<string> {
  if (typeof value === "string") return [value]
  if (typeof value === "object" && value !== null)
    return Object.values(value).flatMap(strings)
  return []
}

describe("CALLS_WORDS", () => {
  it("names no machinery, in any line it can say", () => {
    const said = [
      ...strings(CALLS_WORDS),
      CALLS_WORDS.week("2026-10-30", "2026-11-05"),
      CALLS_WORDS.shareTitle("2026-10-30"),
      ...[0, 1, 50, 99, 100].map((done) => CALLS_WORDS.bringing(done, 100)),
    ]
    for (const line of said) expect(line).not.toMatch(MACHINERY)
  })

  it("says a share below a hundred until the video is whole", () => {
    expect([share(0, 10), share(5, 10), share(10, 10), share(1, 0)]).toEqual([
      0, 50, 99, 0,
    ])
  })
})
