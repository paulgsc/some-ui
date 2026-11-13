/**
 * Every limit's words read as what is kept and what happens at the limit,
 * and none of them names the machinery behind it.
 */
import { describe, expect, it } from "vitest"

import { MACHINERY } from "@/lib/home-link/__tests__/machinery"
import type { LimitWords } from "@/lib/limits/words"
import {
  HOME_LIMITS,
  LIMITS_WORDS,
  PHONE_LIMITS,
  STATUS_LIMITS,
  WHAT_HAPPENS,
} from "@/lib/limits/words"

const TABLES: Readonly<Record<string, Readonly<Record<string, LimitWords>>>> = {
  phone: PHONE_LIMITS,
  home: HOME_LIMITS,
  status: STATUS_LIMITS,
}

/** Each line a row can say, at a few counts. */
const said = (words: LimitWords): Array<string> => [
  words.what,
  words.then,
  WHAT_HAPPENS[words.atLimit],
  ...["0", "7", "12 KB"].map((n) => words.standing(n, "20")),
  ...(words.nothing === undefined ? [] : [words.nothing("30 days")]),
]

describe("limit words", () => {
  for (const [concern, table] of Object.entries(TABLES)) {
    it(`says ${concern}'s limits without the machinery`, () => {
      const lines = Object.values(table).flatMap(said)
      expect(lines.filter((line) => MACHINERY.test(line))).toEqual([])
    })
  }

  it("says the page's own lines without the machinery", () => {
    const lines = [
      LIMITS_WORDS.title,
      LIMITS_WORDS.lead,
      LIMITS_WORDS.counting,
      LIMITS_WORDS.unread,
      LIMITS_WORDS.days(1),
      LIMITS_WORDS.days(30),
      LIMITS_WORDS.underADay,
    ]
    expect(lines.filter((line) => MACHINERY.test(line))).toEqual([])
  })

  it("says what is kept and the limit in where it stands", () => {
    for (const table of Object.values(TABLES)) {
      for (const words of Object.values(table)) {
        expect(words.standing("7", "20")).toContain("7")
        expect(words.standing("7", "20")).toContain("20")
      }
    }
  })
})
