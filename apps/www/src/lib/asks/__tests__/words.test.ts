/**
 * @vitest-environment node
 *
 * The Asks pages say everything in the owner's terms (CLAUDE.md, "State in
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
  ASKS_WORDS.since("2026-11-20T09:00:00Z", null),
  ASKS_WORDS.since("2026-11-20T09:00:00Z", "2026-11-22T09:00:00Z"),
  ...[1, 2].map(ASKS_WORDS.unreadHere),
  ...[1, 2].flatMap((n) => [
    ASKS_WORDS.inCell.decision(n),
    ASKS_WORDS.inCell.checklist(n),
  ]),
  ASKS_WORDS.step(0, 3),
  ASKS_WORDS.where("Grafana on home"),
  ASKS_WORDS.stepsDone(1, 3),
  ...[1, 2].map(ASKS_WORDS.receiptHolds),
]

describe("the Asks pages' words", () => {
  it("never name the machinery", () => {
    expect(all.filter((line) => MACHINERY.test(line))).toEqual([])
  })

  it("say since when an ask waits, or when it was answered", () => {
    expect(ASKS_WORDS.since("2026-11-20T09:00:00Z", null)).toBe("Nov 20")
    expect(
      ASKS_WORDS.since("2026-11-20T09:00:00Z", "2026-11-22T09:00:00Z")
    ).toBe("Answered Nov 22")
  })

  it("count steps from one", () => {
    expect(ASKS_WORDS.step(0, 3)).toBe("Step 1 of 3")
  })
})
