import { counted } from "@some-ui/core-utils"
import {
  POOL_BAR_LABEL,
  poolCount,
  poolFull,
  poolFullNote,
  reasonOf,
} from "@topik/lib/topik/read-aloud/sitting-words"
import { describe, expect, it } from "vitest"

/** What the person must never be told in: how it works, not what it did. */
const MACHINERY =
  /\b(queue|deck|pool|draw\w*|seed|reducer|machine|entry|entries|role|rep|list|id|key|null|undefined|state|index|stuck report|introduction)\b/i

const STEPS = [
  "glyphs",
  "turn",
  "audio",
  "echo",
  "gloss",
  "intro-audio",
  "intro-hold",
  "paused",
] as const
const ROLES = ["rep", "return", "introduction"] as const
const POOLS = [
  { shown: 0, of: 54 },
  { shown: 37, of: 54 },
  { shown: 54, of: 54 },
  { shown: 1, of: 1 },
  { shown: 2, of: 3 },
]

describe("the sitting's words", () => {
  it("marks a return at every step it runs, and a second read at the echo", () => {
    for (const step of STEPS) {
      expect(reasonOf("return", step)).toBe(
        step === "paused" ? null : "Back: you marked it stuck"
      )
      expect(reasonOf("rep", step)).toBe(step === "echo" ? "Second read" : null)
    }
  })

  it("counts the sentences shown, with its noun agreeing", () => {
    expect(poolCount({ shown: 37, of: 54 })).toBe(
      `37 of ${counted(54, "sentence")} shown this sitting`
    )
    expect(poolCount({ shown: 1, of: 1 })).toBe(
      "1 of 1 sentence shown this sitting"
    )
  })

  it("is full only once every sentence has been shown, and there are some", () => {
    expect(POOLS.map(poolFull)).toEqual([false, false, true, true, false])
    expect(poolFull({ shown: 0, of: 0 })).toBe(false)
  })

  it("names how many there are when it is full", () => {
    expect(poolFullNote({ shown: 54, of: 54 })).toBe(
      "You've seen all 54 sentences this sitting. From here they come back, the ones I showed longest ago first."
    )
  })

  it("never reaches for the machinery's terms", () => {
    const words = [
      POOL_BAR_LABEL,
      ...POOLS.flatMap((pool) => [poolCount(pool), poolFullNote(pool)]),
      ...ROLES.flatMap((role) =>
        STEPS.flatMap((step) => reasonOf(role, step) ?? [])
      ),
    ]
    for (const line of words) expect(line).not.toMatch(MACHINERY)
  })
})
