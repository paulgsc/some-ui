import type { RoutineFile } from "@topik/lib/topik/adapter/routine-files"
import type {
  Dish,
  HeldLine,
  HeldSet,
  Holdings,
  Order,
} from "@topik/lib/topik/core/portion"
import {
  DUE_DAYS,
  holdingsOf,
  holdsNew,
  openingOrder,
  PORTION_WORDS,
  portionDeck,
  serve,
  SNACK_LINES,
} from "@topik/lib/topik/core/portion"
import { workedLesson } from "@topik/lib/topik/generation/tree-intake/worked-example"
import { MACHINERY } from "@topik/lib/topik/read-aloud/__tests__/machinery"
import { resolveSets } from "@topik/lib/topik/read-aloud/added-sets"
import type { ReadAloudDeck } from "@topik/lib/topik/read-aloud/content"
import type { Tally } from "@topik/lib/topik/read-aloud/tally"
import { noteShown, tallyKey } from "@topik/lib/topik/read-aloud/tally"
import { describe, expect, it } from "vitest"

// Noon keeps every timezone on the same local day.
const NOW = new Date("2026-10-24T12:00:00.000Z")
const daysAgo = (days: number): string =>
  new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString()

const lineOf = (set: string, n: number): HeldLine => ({
  id: `${set}.line-${n}`,
  korean: `${set} 문장 ${n}`,
  english: `${set} sentence ${n}`,
})

const setOf = (
  id: string,
  lines: number,
  over: Partial<HeldSet> = {}
): HeldSet => ({
  id,
  title: id,
  practice: "read-aloud",
  lines: Array.from({ length: lines }, (_, n) => lineOf(id, n + 1)),
  addedAt: "2026-10-01T06:00:00.000Z",
  ...over,
})

const NONE: Holdings = { sets: [], scenes: [], dramas: [] }

/** The tally after each line was shown at `at`. */
const shown = (
  lines: ReadonlyArray<HeldLine>,
  at: string,
  tally: Tally = {}
): Tally =>
  lines.reduce(
    (rows, line) =>
      noteShown(rows, tallyKey({ lineId: line.id, text: line.korean }), at),
    tally
  )

const order = (
  portion: Order["portion"],
  freshness: Order["freshness"] = "either"
): Order => ({ portion, freshness })

/** Every dish the order offers, "another" after "another", until it repeats. */
function dishesFor(held: Holdings, tally: Tally, asked: Order): Array<Dish> {
  const dishes: Array<Dish> = []
  for (;;) {
    const served = dishes.map((dish) => dish.key)
    const dish = serve({ order: asked, held, tally, now: NOW, served })
    if (dish === null || served.includes(dish.key)) return dishes
    dishes.push(dish)
  }
}

const servings = (held: Holdings, tally: Tally, asked: Order): Array<string> =>
  dishesFor(held, tally, asked).map((dish) => dish.key)

describe("a bite", () => {
  const cafe = setOf("cafe", 3)

  it("is one sentence, never shown first when asked for new", () => {
    const tally = shown([lineOf("cafe", 1)], daysAgo(1))
    const dish = serve({
      order: order("bite", "new"),
      held: { ...NONE, sets: [cafe] },
      tally,
      now: NOW,
    })
    expect(dish).toMatchObject({
      portion: "bite",
      lines: [lineOf("cafe", 2)],
      fresh: { kind: "new" },
    })
  })

  it(`is due again ${DUE_DAYS} days after its last showing, and seen before that`, () => {
    const held = { ...NONE, sets: [setOf("cafe", 2)] }
    const due = shown([lineOf("cafe", 1)], daysAgo(DUE_DAYS))
    const seen = shown([lineOf("cafe", 2)], daysAgo(DUE_DAYS - 1), due)
    const keys = servings(held, seen, order("bite", "seen"))
    expect(keys).toEqual(["bite:cafe.line-1", "bite:cafe.line-2"])
    const first = serve({
      order: order("bite", "seen"),
      held,
      tally: seen,
      now: NOW,
    })
    expect(first?.fresh).toEqual({ kind: "due", lastShown: daysAgo(DUE_DAYS) })
    expect(first && PORTION_WORDS.fact(first, NOW)).toBe(
      `Due again · last shown ${DUE_DAYS} days ago`
    )
  })

  it("under either, offers what is due, then what is new, then what was seen, the longest ago first", () => {
    const held = { ...NONE, sets: [setOf("cafe", 4)] }
    let tally = shown([lineOf("cafe", 1)], daysAgo(1))
    tally = shown([lineOf("cafe", 2)], daysAgo(2), tally)
    tally = shown([lineOf("cafe", 3)], daysAgo(10), tally)
    expect(servings(held, tally, order("bite"))).toEqual([
      "bite:cafe.line-3",
      "bite:cafe.line-4",
      "bite:cafe.line-2",
      "bite:cafe.line-1",
    ])
  })

  it("is never cut from a grammar lens set, which is not read aloud", () => {
    const held = { ...NONE, sets: [setOf("lens", 3, { practice: "lens" })] }
    expect(
      serve({ order: order("bite"), held, tally: {}, now: NOW })
    ).toBeNull()
  })
})

describe("a snack", () => {
  it(`is ${SNACK_LINES} sentences in a row, and another goes on to the next ones of the same set`, () => {
    const older = setOf("older", 4, { addedAt: "2026-09-01T00:00:00.000Z" })
    const newer = setOf("newer", 10)
    const held = { ...NONE, sets: [older, newer] }
    const keys = servings(held, {}, order("snack", "new"))
    // The newest set first, its cuts in order, the last one short.
    expect(keys).toEqual([
      "snack:newer:0",
      "snack:newer:4",
      "snack:newer:8",
      "snack:older:0",
    ])
    const last = serve({
      order: order("snack", "new"),
      held,
      tally: {},
      now: NOW,
      served: keys.slice(0, 2),
    })
    expect(last?.portion === "snack" && last.lines).toHaveLength(2)
  })

  it("goes on in the same set even when another set's lines rank first", () => {
    const due = setOf("due", 4, { addedAt: "2026-09-01T00:00:00.000Z" })
    const cafe = setOf("cafe", 8)
    const held = { ...NONE, sets: [due, cafe] }
    const tally = shown(due.lines, daysAgo(20))
    const next = serve({
      order: order("snack"),
      held,
      tally,
      now: NOW,
      served: ["snack:cafe:0"],
    })
    expect(next?.key).toBe("snack:cafe:4")
  })

  it("is seen before once any of its sentences was shown lately", () => {
    const held = { ...NONE, sets: [setOf("cafe", 4)] }
    let tally = shown([lineOf("cafe", 1)], daysAgo(30))
    tally = shown([lineOf("cafe", 2)], daysAgo(1), tally)
    const dish = serve({ order: order("snack"), held, tally, now: NOW })
    expect(dish?.fresh).toEqual({ kind: "seen", lastShown: daysAgo(1) })
  })
})

describe("a meal", () => {
  it("is the routine's scene not opened yet, standing for the sets it adds", () => {
    const held: Holdings = {
      ...NONE,
      sets: [setOf("scene-read", 12), setOf("cafe", 6)],
      scenes: [
        {
          key: "scene/a.json",
          title: "TOPIK 2 · 로맨스 · 첫 만남",
          opened: false,
          setIds: ["scene-read"],
        },
      ],
    }
    // Its set is not offered on its own; a set never read from still is.
    expect(servings(held, {}, order("meal", "new"))).toEqual([
      "meal:routine:scene/a.json",
      "meal:set:cafe",
    ])
    const dish = serve({
      order: order("meal", "new"),
      held,
      tally: {},
      now: NOW,
    })
    expect(dish && PORTION_WORDS.fact(dish, NOW)).toBe("New · from the routine")
  })

  it("is a whole set, as its sentences were shown", () => {
    const ready = setOf("ready", 3)
    const opened = setOf("opened", 3)
    const held = { ...NONE, sets: [ready, opened] }
    const tally = shown(opened.lines, daysAgo(9))
    // Due again first, then new.
    expect(servings(held, tally, order("meal"))).toEqual([
      "meal:set:opened",
      "meal:set:ready",
    ])
  })
})

describe("dessert", () => {
  const held: Holdings = {
    ...NONE,
    dramas: [
      {
        start: { from: "routine", key: "drama/b.json" },
        title: "숨",
        seen: false,
      },
      { start: { from: "pasted" }, title: "첫사랑", seen: true },
    ],
  }

  it("is the routine's drama while it is not opened, and the one played this session after", () => {
    expect(
      serve({ order: order("dessert", "new"), held, tally: {}, now: NOW })?.key
    ).toBe("dessert:routine:drama/b.json")
    expect(
      serve({ order: order("dessert", "seen"), held, tally: {}, now: NOW })?.key
    ).toBe("dessert:pasted")
  })
})

describe("another one like this", () => {
  it("starts over past the dish on screen once every one was served", () => {
    const held = { ...NONE, sets: [setOf("cafe", 2)] }
    const again = serve({
      order: order("bite"),
      held,
      tally: {},
      now: NOW,
      served: ["bite:cafe.line-1", "bite:cafe.line-2"],
    })
    expect(again?.key).toBe("bite:cafe.line-1")
  })

  it("serves the only one again rather than nothing", () => {
    const held = { ...NONE, sets: [setOf("cafe", 1)] }
    expect(
      serve({
        order: order("bite"),
        held,
        tally: {},
        now: NOW,
        served: ["bite:cafe.line-1"],
      })?.key
    ).toBe("bite:cafe.line-1")
  })
})

describe("the order the question screen opens on", () => {
  it("is the last one asked for, leaning fresh while something is not opened yet", () => {
    expect(openingOrder(null, false)).toEqual(order("bite"))
    expect(openingOrder(order("meal", "seen"), false)).toEqual(
      order("meal", "seen")
    )
    expect(openingOrder(order("meal", "seen"), true)).toEqual(
      order("meal", "new")
    )
  })

  it("counts a scene or a drama not opened yet, or a sentence never shown, as something new", () => {
    const cafe = setOf("cafe", 1)
    expect(holdsNew(NONE, {})).toBe(false)
    expect(holdsNew({ ...NONE, sets: [cafe] }, {})).toBe(true)
    expect(
      holdsNew({ ...NONE, sets: [cafe] }, shown(cafe.lines, daysAgo(1)))
    ).toBe(false)
    expect(
      holdsNew(
        {
          ...NONE,
          scenes: [
            {
              key: "scene/a.json",
              title: "첫 만남",
              opened: false,
              setIds: [],
            },
          ],
        },
        {}
      )
    ).toBe(true)
  })
})

describe("what the phone holds", () => {
  const deck: ReadAloudDeck = {
    id: "cafe",
    title: "Cafe",
    practice: "read-aloud",
    words: [{ id: "keopi", lemma: "커피", gloss: "coffee" }],
    lines: [
      {
        id: "coffee",
        level: 1,
        korean: "커피",
        english: "Coffee.",
        words: [{ wordId: "keopi", surface: "커피", stemEnd: 2 }],
      },
    ],
  }
  const added = [{ deck, addedAt: "2026-10-01T06:00:00.000Z", openedAt: null }]
  const tree = workedLesson()
  const routine: Array<RoutineFile> = [
    {
      kind: "scene",
      name: "a.json",
      title: "첫 만남",
      decks: [{ schemaVersion: 1, ...deck }],
    },
    { kind: "drama", name: "b.json", tree },
  ]

  it("reads each set as the drill does, and the routine's files as opened or not", () => {
    const held = holdingsOf({
      added,
      sets: resolveSets(added).sets,
      routine,
      opened: new Set(["drama/b.json"]),
      pasted: null,
      canRead: true,
    })
    expect(held.sets).toMatchObject([
      { id: "cafe", lines: [{ id: "cafe.coffee", korean: "커피" }] },
    ])
    expect(held.scenes).toEqual([
      {
        key: "scene/a.json",
        title: "첫 만남",
        opened: false,
        setIds: ["cafe"],
      },
    ])
    expect(held.dramas).toMatchObject([
      { start: { from: "routine", key: "drama/b.json" }, seen: true },
    ])
  })

  it("offers nothing read aloud with no voice to read it", () => {
    const held = holdingsOf({
      added,
      sets: resolveSets(added).sets,
      routine,
      opened: new Set(),
      pasted: "첫사랑",
      canRead: false,
    })
    expect(held.sets).toEqual([])
    expect(held.scenes).toEqual([])
    expect(held.dramas).toHaveLength(2)
  })

  it("cuts a bite's deck to its lines, under its own id, the lines' ids kept", () => {
    const own = resolveSets(added).sets.get("cafe")
    if (own === undefined) throw new Error("no set")
    const cut = portionDeck(own, ["cafe.coffee"])
    expect(cut.id).not.toBe(own.id)
    expect(cut.lines.map((line) => line.id)).toEqual(["cafe.coffee"])
    expect(portionDeck(own, ["cafe.coffee"]).id).toBe(cut.id)
  })
})

describe("its words", () => {
  const held: Holdings = {
    sets: [setOf("cafe", 6), setOf("ready", 3)],
    scenes: [
      { key: "scene/a.json", title: "첫 만남", opened: false, setIds: [] },
    ],
    dramas: [{ start: { from: "pasted" }, title: "숨", seen: true }],
  }
  const tally = shown([lineOf("cafe", 1)], daysAgo(9))
  const dishes = (["bite", "snack", "meal", "dessert"] as const).flatMap(
    (portion) => dishesFor(held, tally, order(portion))
  )
  const words = [
    PORTION_WORDS.title,
    PORTION_WORDS.lead,
    PORTION_WORDS.entryDetails,
    ...Object.values(PORTION_WORDS.portions).flatMap((p) => [p.en, p.hint]),
    ...Object.values(PORTION_WORDS.freshness),
    ...(["bite", "snack", "meal", "dessert"] as const).flatMap((portion) =>
      (["new", "seen", "either"] as const).flatMap((freshness) => [
        PORTION_WORDS.served(order(portion, freshness)),
        PORTION_WORDS.none(order(portion, freshness)),
      ])
    ),
    ...dishes.flatMap((dish) => [
      PORTION_WORDS.fact(dish, NOW),
      PORTION_WORDS.what(dish),
    ]),
  ]

  it("say what is served and how it stands, never the machinery or a time to spend", () => {
    expect(dishes.length).toBeGreaterThan(3)
    for (const said of words) {
      expect(said).not.toMatch(MACHINERY)
      expect(said).not.toMatch(/\bminutes?\b|\bmins?\b/i)
    }
  })
})
