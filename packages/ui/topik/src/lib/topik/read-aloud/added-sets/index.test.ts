import type { AddedSet } from "@topik/lib/topik/read-aloud/added-sets"
import {
  ADDED_SET_LIMIT,
  addSet,
  ALL_SETS_ID,
  intakeSet,
  openSet,
  readySets,
  resolveSets,
  setLevel,
  wordsLeaving,
} from "@topik/lib/topik/read-aloud/added-sets"
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

/** The first set added: 주다 and 커피. */
const CAFE: ReadAloudDeck = {
  id: "cafe",
  title: "Cafe",
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
    const { all, sets } = resolveSets([added(CAFE), added(PLANS)])
    expect(all.words.map((word) => word.id)).toEqual([
      "juda",
      "keopi",
      "yaksok",
    ])
    expect(all.lines.map((each) => each.id)).toEqual([
      "cafe.coffee",
      "plans-2.line-1",
    ])
    expect(sets.get("plans-2")?.lines.map((each) => each.id)).toEqual([
      "plans-2.line-1",
    ])
  })

  it("never lets two sets' lines collide", () => {
    const other = { ...PLANS, id: "plans-3" }
    const { all } = resolveSets([added(CAFE), added(PLANS), added(other)])
    expect(all.lines.map((each) => each.id)).toEqual([
      "cafe.coffee",
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
    const { all, sets } = resolveSets([added(CAFE), added(clash)])
    expect(all.words.find((word) => word.id === "keopi")?.lemma).toBe("커피")
    expect(sets.get("plans-2")?.lines.map((each) => each.id)).toEqual([
      "plans-2.line-1",
    ])
  })

  it("reads a lens set's lines only in the lens, and every lens in it", () => {
    const lens = { misforms: [] }
    const asked: ReadAloudDeck = {
      ...PLANS,
      practice: "lens",
      lines: PLANS.lines.map((kept) => ({ ...kept, lens })),
    }
    const legacy: ReadAloudDeck = {
      ...CAFE,
      lines: CAFE.lines.map((kept) => ({ ...kept, lens })),
    }
    const { all, lens: asking } = resolveSets([added(legacy), added(asked)])
    expect(all.lines.map((kept) => kept.id)).toEqual(["cafe.coffee"])
    expect(all.words.map((word) => word.id)).toContain("yaksok")
    expect(asking.lines.map((kept) => kept.id)).toEqual([
      "cafe.coffee",
      "plans-2.line-1",
    ])
  })

  it("reads every set as one deck no set's id can name", () => {
    const { all } = resolveSets([])
    expect(all).toMatchObject({ id: ALL_SETS_ID, words: [], lines: [] })
    expect(intakeSet(file({ ...PLANS, id: ALL_SETS_ID }), [])).toMatchObject({
      ok: false,
    })
  })

  it("names the words a set picked again no longer names, and no others", () => {
    const shorter: ReadAloudDeck = {
      ...PLANS,
      words: PLANS.words.filter((word) => word.id !== "yaksok"),
      lines: [
        line("line-2", "주세요.", [
          { wordId: "juda", surface: "주세요", stemEnd: 1 },
        ]),
      ],
    }
    const before = [added(CAFE), added(PLANS)]
    expect([...wordsLeaving(before, addSet(before, shorter, "b"))]).toEqual([
      "yaksok",
    ])
  })

  it("names a word whose id a set picked again puts on another dictionary form", () => {
    const renamed: ReadAloudDeck = {
      ...PLANS,
      words: PLANS.words.map((word) =>
        word.id === "yaksok" ? { ...word, lemma: "약" } : word
      ),
      lines: [
        line("line-1", "약 주세요.", [
          { wordId: "yaksok", surface: "약", stemEnd: 1 },
          { wordId: "juda", surface: "주세요", stemEnd: 1 },
        ]),
      ],
    }
    const before = [added(CAFE), added(PLANS)]
    expect([...wordsLeaving(before, addSet(before, renamed, "b"))]).toEqual([
      "yaksok",
    ])
  })
})

describe("intakeSet", () => {
  it("takes a set from a fenced reply, and counts the lines it cannot read", () => {
    const withBadLine = {
      ...PLANS,
      lines: [...PLANS.lines, line("line-2", "약속이", [])],
    }
    const intake = intakeSet(`\`\`\`json\n${file(withBadLine)}\n\`\`\``, [
      added(CAFE),
    ])
    expect(intake).toMatchObject({ ok: true, dropped: 1 })
    expect(intake.ok && intake.deck.from).toBe(PLANS.from)
  })

  it("refuses what is not a readable set", () => {
    expect(intakeSet("hello", [added(CAFE)])).toEqual({
      ok: false,
      error: "That file isn't a word set.",
    })
    expect(
      intakeSet(file({ ...PLANS, lines: [line("x", "약속이", [])] }), [
        added(CAFE),
      ])
    ).toEqual({ ok: false, error: "No line in that word set can be read." })
  })

  it("refuses a set picked again that would leave another with nothing to read", () => {
    // `keopi` is CAFE's 커피 and CLASH's 코피; CAFE comes first, so CLASH's
    // line on it is dropped and it reads only its own. ONLY_KEOPI reads 커피.
    const CLASH: ReadAloudDeck = {
      id: "clash",
      title: "Clash",
      words: [
        { id: "keopi", lemma: "코피", gloss: "nosebleed" },
        { id: "yaksok", lemma: "약속", gloss: "plans" },
      ],
      lines: [
        line("nose", "코피", [
          { wordId: "keopi", surface: "코피", stemEnd: 2 },
        ]),
        line("plans", "약속", [
          { wordId: "yaksok", surface: "약속", stemEnd: 2 },
        ]),
      ],
    }
    const ONLY_KEOPI: ReadAloudDeck = {
      id: "only-keopi",
      title: "Only coffee",
      words: [{ id: "keopi", lemma: "커피", gloss: "coffee" }],
      lines: [
        line("cup", "커피", [{ wordId: "keopi", surface: "커피", stemEnd: 2 }]),
      ],
    }
    const kept = [added(CAFE), added(CLASH), added(ONLY_KEOPI)]
    // CAFE again without 커피: CLASH's 코피 would win, emptying ONLY_KEOPI.
    const withoutCoffee: ReadAloudDeck = {
      ...CAFE,
      words: CAFE.words.filter((word) => word.id !== "keopi"),
      lines: [
        line("give", "주세요", [
          { wordId: "juda", surface: "주세요", stemEnd: 1 },
        ]),
      ],
    }
    expect(intakeSet(file(withoutCoffee), kept)).toEqual({
      ok: false,
      error: 'That word set would leave "Only coffee" with nothing to read.',
    })
    expect(intakeSet(file(CAFE), kept)).toMatchObject({ ok: true })
  })

  it("keeps at most the limit, but a set picked again replaces its copy", () => {
    const full = Array.from({ length: ADDED_SET_LIMIT }, (_, index) =>
      added({ ...PLANS, id: `set-${index}` })
    )
    expect(intakeSet(file(PLANS), full)).toMatchObject({ ok: false })
    expect(intakeSet(file({ ...PLANS, id: "set-0" }), full)).toMatchObject({
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
    expect(sets.map((set) => set.deck.id)).toEqual(["plans-2", "later"])
    expect(readySets(sets).map((set) => set.deck.id)).toEqual([
      "plans-2",
      "later",
    ])
  })

  it("reads a set at its highest line's level", () => {
    expect(setLevel(PLANS)).toBe(2)
    expect(setLevel(CAFE)).toBe(1)
  })
})
