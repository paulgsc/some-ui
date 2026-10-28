/**
 * The recorder speaks in the person's terms: what is kept where, never the
 * machinery behind it (CLAUDE.md, "State in the person's terms").
 */
import { MODES } from "@game-week/lib/modes"
import {
  ago,
  clock,
  keptLine,
  MINUTE_LINE,
  MODE_WORDS,
  NOTICES,
  outboxLine,
  strandedLine,
  WORDS,
} from "@game-week/lib/words"
import { describe, expect, it } from "vitest"

const MACHINERY =
  /\b(grant|consent|scope|sync\w*|server|request|response|status|error|api|http\w*|https?:|\d{3}\b|token|queue|retry|null|undefined|lane|pull\w*|outbox|upload\w*|socket|offset|seq|catalog|fixture|feed|store|idb|indexeddb|blob)\b/i

function everyPhrase(): Array<string> {
  const views = [0, 1, 3].flatMap((waiting) =>
    [0, 1, 2].flatMap((refused) =>
      [true, false].map((sending) => outboxLine({ waiting, refused, sending }))
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
    strandedLine(4_200),
    ago(40_000),
    ago(150_000),
    ...views,
  ]
}

describe("the recorder's words", () => {
  it.each(everyPhrase())("names no machinery: %s", (phrase) => {
    expect(phrase).not.toMatch(MACHINERY)
  })

  it("says what waits, and what home couldn't take, in counts", () => {
    expect(outboxLine({ waiting: 0, refused: 0, sending: true })).toBe("")
    expect(outboxLine({ waiting: 1, refused: 0, sending: true })).toBe(
      "1 bite waits on this phone until home has it."
    )
    expect(outboxLine({ waiting: 3, refused: 2, sending: true })).toBe(
      "3 bites wait on this phone until home has them. Home couldn't take 2 bites. They stay on this phone."
    )
    expect(outboxLine({ waiting: 2, refused: 0, sending: false })).toMatch(
      /keep voice notes on home/
    )
  })

  it("counts time the way the screen shows it", () => {
    expect(clock(7_400)).toBe("0:07")
    expect(clock(60_000)).toBe("1:00")
    expect(ago(40_000)).toBe("40 s ago")
    expect(ago(150_000)).toBe("2 min ago")
  })
})
