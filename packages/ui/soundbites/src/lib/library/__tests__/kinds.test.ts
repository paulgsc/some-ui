/** @vitest-environment node */
import { TAKE_KINDS } from "@soundbites/lib/library/compartments"
import type { TakeNames } from "@soundbites/lib/library/kinds"
import {
  ABOUT_PORTS,
  KIND_OF,
  NO_NAMES,
  portAbout,
  TAKE_OFS,
} from "@soundbites/lib/library/kinds"
import { ABOUT_WORDS, LIBRARY_WORDS } from "@soundbites/lib/library/words"
import { describe, expect, it } from "vitest"

const NAMES: TakeNames = {
  game: (id) => (id === "401772" ? "49ers vs Rams" : null),
  scenario: (id) => (id === "fourth-down" ? "Fourth down" : null),
  question: (week, q) =>
    week === "2026-w47" && q === "time" ? "Tell me about a time" : null,
}

const line = (
  of: Parameters<typeof portAbout>[0],
  ref: string,
  fields?: Record<string, string>
): string => {
  const about = portAbout(of, { ref, fields }, NAMES, ABOUT_WORDS)
  if (about === null) return "studio"
  return [LIBRARY_WORDS.subject(about), LIBRARY_WORDS.detail(about)]
    .filter((part) => part !== null)
    .join(" · ")
}

describe("every kind of take home keeps has its place", () => {
  it("gives each kind but Studio's a compartment of its own and a port", () => {
    for (const of of TAKE_OFS) {
      if (of === "studio") continue
      expect(TAKE_KINDS).toContain(KIND_OF[of])
      expect(ABOUT_PORTS[of]({ ref: "x" }, NO_NAMES, ABOUT_WORDS).kind).toBe(
        KIND_OF[of]
      )
    }
    // Each port's kind is its own: no two kinds share a compartment.
    expect(new Set(Object.values(KIND_OF)).size).toBe(TAKE_OFS.length - 1)
  })

  it("shows a kind this phone doesn't know yet, as another kind", () => {
    expect(portAbout("unknown", { ref: "x" }, NAMES, ABOUT_WORDS)?.kind).toBe(
      "other"
    )
  })
})

describe("what each kind's take is about, through its port", () => {
  it("says a bite's game, its moment and its scenario", () => {
    const fields = {
      strip: "Q3 4:12 · SF 17, LAR 13 · 4th & 2 at the LAR 38",
      scenario: "fourth-down",
      started: "2026-11-16T21:00:00Z",
    }
    expect(line("game", "401772", fields)).toBe(
      "49ers vs Rams · Q3 4:12 · Fourth down"
    )
    // A game the phone can't name is named by the day it was played.
    expect(line("game", "999", fields)).toMatch(/^A game on .+ · Q3 4:12/)
    expect(line("game", "999", {})).toBe("A game")
  })

  it("says an interview take's week and its question, or what was read", () => {
    expect(line("interview", "2026-w47:time")).toBe(
      "Week 47 · Tell me about a time"
    )
    expect(line("interview", "2026-w47:conflict")).toBe("Week 47 · conflict")
    expect(line("interview", "2026-w47:read:intro")).toBe(
      "Week 47 · Read aloud · intro"
    )
  })

  it("says a Rust Rounds take's week and ticket, or its round and card", () => {
    expect(line("rust-round", "2026-w46:QM-311")).toBe("Week 46 · QM-311")
    expect(line("rust-round", "indexing-01:c3")).toBe("indexing 01 · c3")
  })

  it("says the rest from what home was told", () => {
    expect(line("leetype", "two-sum:screen-2")).toBe("two sum · screen 2")
    expect(line("lens", "I-ate-rice")).toBe("I ate rice")
    expect(line("jobs", "2026-11-12:acme_staff")).toBe(
      "acme staff · 2026-11-12"
    )
    expect(line("soundbite", "direct")).toBe("Recorded on Soundbites")
    expect(line("reflection", "s1")).toBe("")
    expect(line("studio", "idea:i1:what")).toBe("studio")
  })
})
