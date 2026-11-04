/** @vitest-environment node */
import type { LibraryBy, TakeFor } from "@soundbites/lib/library/model"
import { LIBRARY_WORDS } from "@soundbites/lib/library/words"
import { describe, expect, it } from "vitest"

/**
 * What the person must never be told in: how it works, not what it does
 * (CLAUDE.md, "State in the person's terms"), with the machinery behind a
 * search of home's words.
 */
const MACHINERY =
  /\b(grant|consent|scope|sync\w*|server|request|response|status|error|api|https?|token|queue|retry|null|undefined|database|store|blob|ref|id|query|index\w*|transcri\w*|embedding\w*|vector\w*|library|404|422|q)\b/i

/** Other words for a recording: "take" is the one (ST34). */
const OTHER_WORDS = /\b(recordings?|answers?|bites?|notes?|clips?)\b/i

const BY: ReadonlyArray<LibraryBy> = ["newest", "words", "meaning"]
const FOR: ReadonlyArray<TakeFor> = ["scene", "idea", "library", "other"]
const AT = "2026-11-03T09:00:00.000Z"

/** Every word the table says: each fixed one, and each a maker makes. */
function everyWord(): Array<string> {
  const { shown, setAside, line, what, ...fixed } = LIBRARY_WORDS
  const counts: ReadonlyArray<[number, number, number | null]> = [
    [0, 0, null],
    [1, 1, null],
    [50, 120, null],
    [0, 120, 0],
    [1, 120, 1],
    [3, 120, 3],
    [50, 120, 80],
  ]
  return [
    ...Object.values(fixed),
    ...Object.values(what),
    ...BY.flatMap((by) =>
      counts.flatMap(([listed, total, matched]) => [
        shown(by, "brand intro", listed, total, matched),
        shown(by, null, listed, total, matched),
      ])
    ),
    setAside(AT),
    ...FOR.map((each) => line(each, AT)),
  ]
}

describe("Takes on home's words (ST32)", () => {
  const all = everyWord()

  it("never name the machinery", () => {
    expect(all.filter((text) => MACHINERY.test(text))).toEqual([])
  })

  it("call a recording a take, and nothing else (ST34)", () => {
    expect(all.filter((text) => OTHER_WORDS.test(text))).toEqual([])
  })

  it("say which search ran: a search by words never claims meaning", () => {
    const byWords = LIBRARY_WORDS.shown("words", "brand", 3, 120, 3)
    expect(byWords).toBe("3 takes whose words hold “brand”, newest first.")
    expect(byWords).not.toMatch(/meaning/)
    expect(LIBRARY_WORDS.shown("words", "brand", 50, 120, 80)).toBe(
      "The newest 50 of 80 takes whose words hold “brand”."
    )
    expect(LIBRARY_WORDS.shown("words", "brand", 0, 120, 0)).toBe(
      "No take's words hold “brand”."
    )
    expect(LIBRARY_WORDS.shown("meaning", "brand", 3, 120, 3)).toMatch(
      /meaning/
    )
  })

  it("say how many home keeps, and that the newest come first", () => {
    expect(LIBRARY_WORDS.shown("newest", null, 1, 1, null)).toBe(
      "The 1 take home keeps, newest first."
    )
    expect(LIBRARY_WORDS.shown("newest", null, 50, 120, null)).toBe(
      "The newest 50 of the 120 takes home keeps."
    )
  })
})
