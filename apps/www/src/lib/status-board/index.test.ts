/**
 * The status page's order (#2165): every mark value says what it asks of its
 * person, a row that needs them is lifted above its context, the rest keep
 * their context's order, and the page's own words name no machinery.
 */
import { describe, expect, it } from "vitest"

import { MACHINERY } from "@/lib/home-link/__tests__/machinery"
import { HOW_ORDER, WHERE_ORDER } from "@/lib/sharing-marks"
import type { BoardRow, RowMark } from "@/lib/status-board"
import { boardOf, glanceOf, lookOf, needOf } from "@/lib/status-board"
import { BOARD_WORDS, LOOK_WORDS } from "@/lib/status-board/words"

const row = (
  id: string,
  group: BoardRow["group"],
  mark: RowMark
): BoardRow => ({
  id,
  group,
  name: id,
  word: id,
  line: id,
  more: [],
  mark,
  page: "practice",
})

describe("what each mark asks of its person", () => {
  it("lifts only a send that needs a hand, never one under way or turned away once", () => {
    const asks = HOW_ORDER.map((how) => [
      how,
      needOf({ kind: "lane", where: "kept", how }),
    ])
    expect(Object.fromEntries(asks)).toEqual({
      current: "fine",
      waiting: "moving",
      sending: "moving",
      bringing: "moving",
      "no-answer": "watch",
      busy: "watch",
      forgotten: "you",
      unpaired: "you",
      full: "you",
      "no-room": "you",
      refused: "you",
      fault: "you",
      failed: "you",
    })
  })

  it("asks nothing of a record its person keeps on the phone, and waits on one not seen yet", () => {
    for (const where of WHERE_ORDER) {
      expect(needOf({ kind: "lane", where, how: null })).toBe(
        where === "checking" || where === "kept" ? "moving" : "off"
      )
    }
  })

  it("lifts a stopped run and picks that wait on you", () => {
    const morning = (
      theme: "stopped" | "waiting" | "moving" | "read"
    ): string => needOf({ kind: "journey", at: "run", sign: "none", theme })
    expect(morning("stopped")).toBe("you")
    expect(morning("waiting")).toBe("you")
    expect(morning("moving")).toBe("moving")
    expect(morning("read")).toBe("fine")
  })

  it("reads Korean's look as off, not yet, or how home answered", () => {
    expect(lookOf(false, { kind: "read", at: 1 })).toBe("off")
    expect(lookOf(true, null)).toBe("not-yet")
    expect(lookOf(true, { kind: "busy", at: 1 })).toBe("busy")
    expect(needOf({ kind: "look", look: "forgotten" })).toBe("you")
    expect(needOf({ kind: "look", look: "unreachable" })).toBe("watch")
    expect(needOf({ kind: "look", look: "off" })).toBe("off")
  })
})

describe("the board", () => {
  const fine = row("practice", "home", {
    kind: "lane",
    where: "kept",
    how: "current",
  })
  const turnedAway = row("jobs", "home", {
    kind: "lane",
    where: "kept",
    how: "busy",
  })
  const unpaired = row("voice", "home", {
    kind: "lane",
    where: "kept",
    how: "unpaired",
  })
  const look = row("look", "korean", { kind: "look", look: "read" })
  const stopped = row("morning", "jobs", {
    kind: "journey",
    at: "run",
    sign: "stopped",
    theme: "stopped",
  })

  it("lifts what needs you above every context, in the order given", () => {
    const board = boardOf([fine, unpaired, look, stopped, turnedAway])
    expect(board.needsYou.map((r) => r.id)).toEqual(["voice", "morning"])
    expect(board.groups.map((g) => g.id)).toEqual(["home", "korean"])
  })

  it("orders each context by what it asks, and leaves an emptied one out", () => {
    const board = boardOf([fine, turnedAway, stopped])
    expect(board.groups).toEqual([{ id: "home", rows: [turnedAway, fine] }])
  })

  it("glances at every row once, in the page's order", () => {
    const board = boardOf([fine, unpaired, look, stopped])
    expect(glanceOf(board).map((r) => r.id)).toEqual([
      "voice",
      "morning",
      "practice",
      "look",
    ])
  })
})

describe("the page's own words", () => {
  it("name no machinery", () => {
    const strings = (value: unknown): Array<string> =>
      typeof value === "string"
        ? [value]
        : typeof value === "function"
          ? [String(value("Practice"))]
          : typeof value === "object" && value !== null
            ? Object.values(value).flatMap(strings)
            : []
    const said = [BOARD_WORDS, LOOK_WORDS].flatMap(strings)
    expect(said.length).toBeGreaterThan(15)
    expect(said.filter((text) => MACHINERY.test(text))).toEqual([])
  })
})
