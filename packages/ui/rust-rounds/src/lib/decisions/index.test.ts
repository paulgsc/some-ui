/**
 * The owner's decisions at a week's forks (RR29, C693): every pick kept,
 * a fork left alone named at send, and nothing the week doesn't offer.
 */
import { atSend, currentPick, pick } from "@rust-rounds/lib/decisions"
import type { PickMade } from "@rust-rounds/lib/decisions"
import { QUILLMOSS_WEEK } from "@rust-rounds/lib/sample-week"
import { TALLOWBROOK_WEEK_FILE } from "@rust-rounds/lib/sample-week/tallowbrook"
import { describe, expect, it } from "vitest"

const week = TALLOWBROOK_WEEK_FILE
const at = (minute: number): string =>
  `2026-11-18T10:${String(minute).padStart(2, "0")}:00.000Z`
const made = (
  fork: number,
  pickMade: PickMade["pick"],
  minute: number,
  ticket = "TB-101"
): PickMade => ({ ticket, fork, pick: pickMade, at: at(minute) })

describe("decisions at a week's forks", () => {
  it("keeps every pick, and the latest is the decision", () => {
    const first = pick(week, [], made(1, { kind: "option", option: "B" }, 1))
    const second = pick(week, first, made(1, { kind: "own" }, 2))
    expect(second).toHaveLength(2)
    expect(currentPick(second, "TB-101", 1)).toEqual({ kind: "own" })
    expect(currentPick(second, "TB-101", 2)).toBeNull()
  })

  it("changes nothing for the same pick again, an option not listed, or a fork not there", () => {
    const once = pick(week, [], made(1, { kind: "option", option: "B" }, 1))
    for (const again of [
      made(1, { kind: "option", option: "B" }, 2),
      made(1, { kind: "option", option: "F" }, 2),
      made(3, { kind: "own" }, 2),
      made(1, { kind: "own" }, 2, "TB-999"),
    ]) {
      expect(pick(week, once, again)).toBe(once)
    }
  })

  it("names a fork left alone at send, apart from an explicit pick of the recommended", () => {
    const picks = [
      made(1, { kind: "option", option: "A" }, 1),
      made(1, { kind: "option", option: "B" }, 2),
      made(1, { kind: "option", option: "A" }, 3),
    ].reduce<ReadonlyArray<PickMade>>(
      (kept, each) => pick(week, kept, each),
      []
    )
    expect(atSend(week, picks)).toEqual([
      {
        ticket: "TB-101",
        forks: [
          { fork: 1, decision: { kind: "option", option: "A" } },
          { fork: 2, decision: { kind: "recommended-by-default" } },
        ],
      },
      {
        ticket: "TB-102",
        forks: [{ fork: 1, decision: { kind: "recommended-by-default" } }],
      },
      {
        ticket: "TB-103",
        forks: [{ fork: 1, decision: { kind: "recommended-by-default" } }],
      },
    ])
  })

  it("sends nothing for a /1 week, whose points offer no options", () => {
    const ticket = QUILLMOSS_WEEK.tickets[0]?.id ?? ""
    expect(
      pick(QUILLMOSS_WEEK, [], made(1, { kind: "own" }, 1, ticket))
    ).toEqual([])
    expect(atSend(QUILLMOSS_WEEK, [])).toEqual([])
  })
})
