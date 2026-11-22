/**
 * @vitest-environment node
 *
 * The Asks page says everything in the owner's terms (CLAUDE.md, "State in
 * the person's terms").
 */
import { describe, expect, it } from "vitest"

import { ASKS_WORDS } from "@/lib/asks/words"
import { MACHINERY } from "@/lib/home-link/__tests__/machinery"

function strings(value: unknown): Array<string> {
  if (typeof value === "string") return [value]
  if (typeof value === "object" && value !== null)
    return Object.values(value).flatMap(strings)
  return []
}

const all = [
  ...strings(ASKS_WORDS),
  ASKS_WORDS.unblocks("the next story"),
  ASKS_WORDS.whenDone("the clip on the public site"),
  ASKS_WORDS.step(0, 3),
  ASKS_WORDS.where("Grafana on home"),
  ASKS_WORDS.stepsDone(1, 3),
]

describe("the Asks page's words", () => {
  it("never name the machinery", () => {
    expect(all.filter((line) => MACHINERY.test(line))).toEqual([])
  })

  it("count steps from one", () => {
    expect(ASKS_WORDS.step(0, 3)).toBe("Step 1 of 3")
  })
})
