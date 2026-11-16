/**
 * The owner's rules for what the interview week's screen says (IW5): no score,
 * grade, verdict or "you said", nothing that calls a take good or bad, and no
 * status code or internal name. A card's target length and the 2-minute cap
 * are shown, as #2936 asks; nothing counts how long a take ran.
 */
import { describe, expect, it } from "vitest"

import { INTERVIEW_WORDS } from "@/lib/interview-week/words"

import { WEEK } from "./fixture"

/** Every string the table can produce, with sample arguments. */
function everyWord(value: unknown): Array<string> {
  if (typeof value === "string") return [value]
  if (typeof value === "function") {
    const samples =
      value.length === 2
        ? [
            ["Backend engineer", "Tidewell"],
            [2, "2026-11-17T10:00:00.000Z"],
            [1, 6],
          ]
        : [[1], [3], [90], [WEEK], ["2026-11-17T10:00:00.000Z"]]
    const said = samples.flatMap((sample) => {
      try {
        const word: unknown = Reflect.apply(value, undefined, sample)
        return typeof word === "string" ? [word] : []
      } catch {
        return []
      }
    })
    if (said.length === 0) throw new Error(`no sample says ${value.name}`)
    return said
  }
  if (typeof value === "object" && value !== null) {
    return Object.values(value).flatMap(everyWord)
  }
  return []
}

const SHOWN = everyWord(INTERVIEW_WORDS)

const BANNED: ReadonlyArray<[string, RegExp]> = [
  [
    "a score or verdict",
    /\b(score|points?|correct|incorrect|wrong|verdict|grade|rating|pass(ed)? the|fail(ed)?\b)/i,
  ],
  ["a take judged", /\b(you said|good answer|bad answer|well done|great)\b/i],
  ["a level or streak", /\b(level|streak|xp)\b/i],
  [
    "the machinery",
    /\b(\d{3} |request|status|sync|grant|draft|bundle|ref|of=|sha|undefined|null)\b/i,
  ],
]

describe("the interview week's words (IW5)", () => {
  it.each(BANNED)("never say %s", (_, pattern) => {
    expect(SHOWN.filter((word) => pattern.test(word))).toEqual([])
  })

  it("show a target length as a person reads one", () => {
    expect(INTERVIEW_WORDS.aim(90)).toBe("Aim for about 1 min 30 s")
    expect(INTERVIEW_WORDS.aim(120)).toBe("Aim for about 2 min")
    expect(INTERVIEW_WORDS.cap).toBe("A take stops at 2 min.")
  })

  it("say the brief's week on the owner's clock", () => {
    expect(INTERVIEW_WORDS.heading(WEEK)).toBe("Week 47 · due Sunday 23:59")
  })
})
