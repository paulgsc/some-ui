/**
 * The recorder speaks in the person's terms: what is kept where, never the
 * machinery behind it (CLAUDE.md, "State in the person's terms").
 */
import type { FeedLink } from "@game-week/lib/feed"
import { MODES } from "@game-week/lib/modes"
import {
  ago,
  clock,
  gameLabel,
  keptLine,
  MINUTE_LINE,
  MODE_WORDS,
  noGamesLine,
  noOfferLine,
  NOTICES,
  outboxLine,
  wantLine,
  WORDS,
} from "@game-week/lib/words"
import { describe, expect, it } from "vitest"

const MACHINERY =
  /\b(grant|consent|scope|sync\w*|server|request|response|status|error|api|http\w*|https?:|\d{3}\b|token|queue|retry|null|undefined|lane|pull\w*|outbox|upload\w*|socket|offset|seq|catalog|fixture|feed|store|idb|indexeddb|blob)\b/i

const LINKS: ReadonlyArray<FeedLink> = [
  "asking",
  "live",
  "away",
  "not-following",
  "unpaired",
  "update",
]

/** Midday UTC: Oct 28 in every zone from UTC-12 to UTC+11. */
const ON_HOME_SINCE = Date.UTC(2026, 9, 28, 12)

const NONE = {
  notKept: 0,
  waiting: 0,
  refused: 0,
  sending: true,
  onHome: null,
}

function everyPhrase(): Array<string> {
  const views = [0, 1, 2].flatMap((notKept) =>
    [0, 1, 3].flatMap((waiting) =>
      [0, 1, 2].flatMap((refused) =>
        [true, false].flatMap((sending) =>
          [0, 1, 12].map((count) =>
            outboxLine({
              notKept,
              waiting,
              refused,
              sending,
              onHome: count === 0 ? null : { count, since: ON_HOME_SINCE },
            })
          )
        )
      )
    )
  )
  return [
    ...Object.values(WORDS),
    ...Object.values(NOTICES),
    ...MODES.flatMap((mode) => [
      MODE_WORDS[mode].name,
      MODE_WORDS[mode].lede,
      ...MODE_WORDS[mode].rows,
    ]),
    MINUTE_LINE,
    keptLine(4_200),
    ago(40_000),
    ago(150_000),
    ...LINKS.flatMap((link) => [noOfferLine(link), noGamesLine(link)]),
    gameLabel("SF", "SEA"),
    wantLine("SF"),
    ...views,
  ]
}

describe("the recorder's words", () => {
  it.each(everyPhrase())("names no machinery: %s", (phrase) => {
    expect(phrase).not.toMatch(MACHINERY)
  })

  it("says what isn't kept yet, what waits, and what home couldn't take, in counts", () => {
    const none = NONE
    expect(outboxLine(none)).toBe("")
    expect(outboxLine({ ...none, waiting: 1 })).toBe(
      "1 bite waits on this phone until home has it."
    )
    expect(outboxLine({ ...none, waiting: 3, refused: 2 })).toBe(
      "3 bites wait on this phone until home has them. Home couldn't take 2 bites. They stay on this phone."
    )
    expect(outboxLine({ ...none, waiting: 2, sending: false })).toMatch(
      /paired with home/
    )
    expect(outboxLine({ ...none, notKept: 2, waiting: 1 })).toBe(
      "2 bites couldn't be kept on this phone yet. The app keeps trying while it's open. 1 bite waits on this phone until home has it."
    )
  })

  it("says how many bites are kept on home instead, and since when (#2080)", () => {
    const none = NONE
    expect(
      outboxLine({ ...none, onHome: { count: 1, since: ON_HOME_SINCE } })
    ).toBe("1 bite kept on home since Oct 28.")
    expect(
      outboxLine({
        ...none,
        waiting: 1,
        onHome: { count: 12, since: ON_HOME_SINCE },
      })
    ).toBe(
      "1 bite waits on this phone until home has it. 12 bites kept on home since Oct 28."
    )
  })

  it("says why nothing is offered live, in the person's terms", () => {
    expect(noOfferLine("away")).toBe(
      "Home is out of reach, so nothing is offered live. Say it first, or pick from every scenario. Your bites wait on this phone until home has them."
    )
    expect(noGamesLine("not-following")).toMatch(/^Home isn't following games/)
    expect(gameLabel("SF", "SEA")).toBe("SEA at SF")
    expect([wantLine("SF"), wantLine(null)]).toEqual(["SF win", ""])
  })

  it("counts time the way the screen shows it", () => {
    expect(clock(7_400)).toBe("0:07")
    expect(clock(60_000)).toBe("1:00")
    expect(ago(40_000)).toBe("40 s ago")
    expect(ago(150_000)).toBe("2 min ago")
  })
})
