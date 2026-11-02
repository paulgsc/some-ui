/**
 * What the drag-down indicator says (PULL0): something in every phase a
 * finger or a check is showing, nothing when idle, and never the machinery.
 */
import { describe, expect, it } from "vitest"

import { MACHINERY } from "@/lib/home-link/__tests__/machinery"
import type { Phase } from "@/lib/pull-refresh/model"
import { PULL_WORDS, pullWords } from "@/lib/pull-refresh/words"

const FROM = { x: 0, y: 0 }
const AT = Date.UTC(2026, 10, 2, 9, 41)

const PHASES: ReadonlyArray<Phase> = [
  { kind: "idle" },
  { kind: "tracking", from: FROM },
  { kind: "pulling", from: FROM, distance: 10 },
  { kind: "armed", from: FROM, distance: 70 },
  { kind: "checking", pull: 1, shown: true },
  { kind: "done", pull: 1, at: AT },
  { kind: "failed", pull: 1, at: AT, offline: false, unread: [] },
  { kind: "failed", pull: 1, at: AT, offline: false, unread: ["this page"] },
  { kind: "failed", pull: 1, at: AT, offline: true, unread: [] },
]

describe("the drag-down's words", () => {
  it("say nothing until a drag has gone down", () => {
    expect(pullWords({ kind: "idle" })).toBeNull()
    expect(pullWords({ kind: "tracking", from: FROM })).toBeNull()
  })

  it("say nothing of a check whose page has moved on", () => {
    expect(pullWords({ kind: "checking", pull: 1, shown: false })).toBeNull()
  })

  it("say there was no connection, and that the page shows what it had", () => {
    expect(
      pullWords({ kind: "failed", pull: 1, at: AT, offline: true, unread: [] })
    ).toBe("No connection: showing what was here")
  })

  it("name what could not be read, two at most and how many more", () => {
    expect(PULL_WORDS.failed([])).toBe("Couldn’t check everything just now")
    expect(PULL_WORDS.failed(["this page"])).toBe(
      "Couldn’t check this page just now"
    )
    expect(PULL_WORDS.failed(["this page", "today’s digest"])).toBe(
      "Couldn’t check this page and today’s digest just now"
    )
    expect(
      PULL_WORDS.failed(["this page", "today’s digest", "the morning run"])
    ).toBe(
      "Couldn’t check this page, today’s digest, and the morning run just now"
    )
    expect(
      PULL_WORDS.failed(["this page", "today’s digest", "a", "b", "c"])
    ).toBe("Couldn’t check this page, today’s digest, and 3 more just now")
  })

  it("say since when the page is up to date", () => {
    expect(pullWords({ kind: "done", pull: 1, at: AT }, () => "9:41")).toBe(
      "Up to date at 9:41"
    )
  })

  it("name no machinery in any phase", () => {
    for (const phase of PHASES) {
      const words = pullWords(phase)
      if (words !== null) expect(words).not.toMatch(MACHINERY)
    }
    expect(PULL_WORDS.done("9:41")).not.toMatch(MACHINERY)
  })
})
