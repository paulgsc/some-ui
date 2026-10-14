import type { AddedSet } from "@topik/lib/topik/read-aloud/added-sets"
import {
  ADDED_SET_LIMIT,
  addSet,
  BUNDLED_DECK_ID,
  intakeSet,
  openSet,
  readySets,
  resolveSets,
  setLevel,
} from "@topik/lib/topik/read-aloud/added-sets"
import { BUNDLED_DECK } from "@topik/lib/topik/read-aloud/bundled"
import type {
  ReadAloudDeck,
  ReadAloudLine,
} from "@topik/lib/topik/read-aloud/content"
import { describe, expect, it } from "vitest"

const line = (
  id: string,
  korean: string,
  words: ReadAloudLine["words"],
  level: ReadAloudLine["level"] = 1
): ReadAloudLine => ({ id, level, korean, english: id, words })

/** The floor: 주다 and 커피, as the bundled deck names them. */
const BASE: ReadAloudDeck = {
  id: BUNDLED_DECK_ID,
  title: "Base",
  words: [
    { id: "juda", lemma: "주다", gloss: "give" },
    { id: "keopi", lemma: "커피", gloss: "coffee" },
  ],
  lines: [
    line("coffee", "커피 주세요.", [
      { wordId: "keopi", surface: "커피", stemEnd: 2 },
      { wordId: "juda", surface: "주세요", stemEnd: 1 },
    ]),
  ],
}

/** A level-two set that reuses 주다 and adds 약속. */
const PLANS: ReadAloudDeck = {
  id: "plans-2",
  title: "Plans",
  from: 'your note on Oct 13: "move to level two"',
  words: [
    { id: "yaksok", lemma: "약속", gloss: "plans" },
    { id: "juda", lemma: "주다", gloss: "give" },
  ],
  lines: [
    line(
      "line-1",
      "약속 주세요.",
      [
        { wordId: "yaksok", surface: "약속", stemEnd: 2 },
        { wordId: "juda", surface: "주세요", stemEnd: 1 },
      ],
      2
    ),
  ],
}

const added = (
  deck: ReadAloudDeck,
  openedAt: string | null = null
): AddedSet => ({
  deck,
  addedAt: "2026-10-14T06:00:00.000Z",
  openedAt,
})

const file = (deck: ReadAloudDeck): string =>
  JSON.stringify({ schemaVersion: 1, ...deck })

describe("resolveSets", () => {
  it("adds a set's new words to the one vocabulary and files its lines under it", () => {
    const { all, sets } = resolveSets(BASE, [added(PLANS)])
    expect(all.words.map((word) => word.id)).toEqual([
      "juda",
      "keopi",
      "yaksok",
    ])
    expect(all.lines.map((each) => each.id)).toEqual([
      "coffee",
      "plans-2.line-1",
    ])
    expect(sets.get("plans-2")?.lines.map((each) => each.id)).toEqual([
      "plans-2.line-1",
    ])
  })

  it("never lets two sets' lines collide", () => {
    const other = { ...PLANS, id: "plans-3" }
    const { all } = resolveSets(BASE, [added(PLANS), added(other)])
    expect(all.lines.map((each) => each.id)).toEqual([
      "coffee",
      "plans-2.line-1",
      "plans-3.line-1",
    ])
  })

  it("drops a word the phone names under another dictionary form, and its lines", () => {
    const clash: ReadAloudDeck = {
      ...PLANS,
      words: [
        ...PLANS.words,
        { id: "keopi", lemma: "코피", gloss: "nosebleed" },
      ],
      lines: [
        ...PLANS.lines,
        line("line-2", "코피", [
          { wordId: "keopi", surface: "코피", stemEnd: 2 },
        ]),
      ],
    }
    const { all, sets } = resolveSets(BASE, [added(clash)])
    expect(all.words.find((word) => word.id === "keopi")?.lemma).toBe("커피")
    expect(sets.get("plans-2")?.lines.map((each) => each.id)).toEqual([
      "plans-2.line-1",
    ])
  })

  it("names the bundled deck's id, which no set may take", () => {
    expect(BUNDLED_DECK.id).toBe(BUNDLED_DECK_ID)
  })
})

describe("intakeSet", () => {
  it("takes a set from a fenced reply, and counts the lines it cannot read", () => {
    const withBadLine = {
      ...PLANS,
      lines: [...PLANS.lines, line("line-2", "약속이", [])],
    }
    const intake = intakeSet(
      `\`\`\`json\n${file(withBadLine)}\n\`\`\``,
      BASE,
      []
    )
    expect(intake).toMatchObject({ ok: true, dropped: 1 })
    expect(intake.ok && intake.deck.from).toBe(PLANS.from)
  })

  it("refuses what is not a readable set", () => {
    expect(intakeSet("hello", BASE, [])).toEqual({
      ok: false,
      error: "That file isn't a word set.",
    })
    expect(
      intakeSet(file({ ...PLANS, id: BUNDLED_DECK_ID }), BASE, [])
    ).toMatchObject({
      ok: false,
    })
    expect(
      intakeSet(file({ ...PLANS, lines: [line("x", "약속이", [])] }), BASE, [])
    ).toEqual({ ok: false, error: "No line in that word set can be read." })
  })

  it("keeps at most the limit, but a set picked again replaces its copy", () => {
    const full = Array.from({ length: ADDED_SET_LIMIT }, (_, index) =>
      added({ ...PLANS, id: `set-${index}` })
    )
    expect(intakeSet(file(PLANS), BASE, full)).toMatchObject({ ok: false })
    expect(
      intakeSet(file({ ...PLANS, id: "set-0" }), BASE, full)
    ).toMatchObject({
      ok: true,
    })
  })
})

describe("the kept list", () => {
  it("offers unopened sets, newest first, and a set picked again as new", () => {
    let sets = addSet([], PLANS, "a")
    sets = addSet(sets, { ...PLANS, id: "later" }, "b")
    expect(readySets(sets).map((set) => set.deck.id)).toEqual([
      "later",
      "plans-2",
    ])

    sets = openSet(sets, "plans-2", "c")
    sets = openSet(sets, "plans-2", "d")
    expect(sets.find((set) => set.deck.id === "plans-2")?.openedAt).toBe("c")
    expect(readySets(sets).map((set) => set.deck.id)).toEqual(["later"])

    sets = addSet(sets, PLANS, "e")
    expect(sets.map((set) => set.deck.id)).toEqual(["later", "plans-2"])
    expect(readySets(sets).map((set) => set.deck.id)).toEqual([
      "plans-2",
      "later",
    ])
  })

  it("reads a set at its highest line's level", () => {
    expect(setLevel(PLANS)).toBe(2)
    expect(setLevel(BASE)).toBe(1)
  })
})
