import {
  CEREMONIES,
  EMOTIONS,
  HOST_CHARACTERS,
  PLACEMENTS,
  SHOTS,
} from "@some-ui/styles/brand/host"
import { describe, expect, it } from "vitest"

import {
  beatOf,
  characterOf,
  lookId,
  lookOf,
  LOOKS_PER_PAGE,
  looksOf,
  pageOf,
  pageOfLooks,
  placementOf,
  seedOf,
  shotOf,
} from "@/lib/cast"
import { CAST_WORDS, lookName } from "@/lib/cast/words"
import { MACHINERY } from "@/lib/home-link/__tests__/machinery"

describe("the Cast wing's looks", () => {
  it("offers every emotion and ceremony each character has, and no other", () => {
    for (const who of HOST_CHARACTERS) {
      expect(looksOf(who).map(lookId)).toEqual([
        ...EMOTIONS[who],
        ...CEREMONIES[who],
      ])
    }
  })

  it("names every look uniquely within its character", () => {
    for (const who of HOST_CHARACTERS) {
      const ids = looksOf(who).map(lookId)
      expect(new Set(ids).size).toBe(ids.length)
      for (const look of looksOf(who)) {
        expect(lookOf(who, lookId(look))).toEqual(look)
      }
    }
  })

  it("makes each look a scene's beat, in every shot and placement", () => {
    for (const who of HOST_CHARACTERS) {
      for (const look of looksOf(who)) {
        for (const shot of SHOTS) {
          for (const placement of PLACEMENTS) {
            const beat = beatOf(look, shot, placement)
            expect(beat.character).toBe(who)
            expect(beat.shot).toBe(shot)
            expect(beat.placement).toBe(placement)
            if (look.kind === "ceremony") {
              expect(beat.emotion).toBe("ceremonious")
              expect(beat.animation).toBe(look.ceremony)
            } else expect(beat.emotion).toBe(look.emotion)
          }
        }
      }
    }
  })

  it("gives each look of a character its own seed", () => {
    for (const who of HOST_CHARACTERS) {
      const seeds = looksOf(who).map(seedOf)
      expect(new Set(seeds).size).toBe(seeds.length)
    }
  })

  it("reads the page's address back, and falls back on anything else", () => {
    expect(characterOf("mochi")).toBe("mochi")
    expect(characterOf("someone")).toBe(HOST_CHARACTERS[0])
    expect(lookOf("tin-owlet", "nfl-celebration")).toBeUndefined()
    expect(lookOf("mochi", "nfl-celebration")?.kind).toBe("ceremony")
    expect(shotOf("long")).toBe("long")
    expect(shotOf(3)).toBe("medium")
    expect(placementOf("center")).toBe("center")
    expect(placementOf("middle")).toBe("bottom-right")
    expect(pageOf(2)).toBe(2)
    expect(pageOf("2")).toBe(0)
    expect(pageOf(1.5)).toBe(0)
  })

  it("pages the looks, keeping a page in range", () => {
    const looks = looksOf("mochi")
    const pages = Math.ceil(looks.length / LOOKS_PER_PAGE)
    expect(pageOfLooks(looks, 0).pageCount).toBe(pages)
    expect(pageOfLooks(looks, 0).looks).toEqual(looks.slice(0, LOOKS_PER_PAGE))
    expect(pageOfLooks(looks, 99).page).toBe(pages - 1)
    expect(pageOfLooks(looks, -1).page).toBe(0)
    expect(pageOfLooks([], 0)).toEqual({ looks: [], page: 0, pageCount: 1 })
    const all = Array.from(
      { length: pages },
      (_, page) => pageOfLooks(looks, page).looks
    ).flat()
    expect(all).toEqual(looks)
  })
})

describe("the Cast wing's words", () => {
  it("says every line without the machinery", () => {
    const lines = [
      CAST_WORDS.wing.name,
      CAST_WORDS.wing.job,
      CAST_WORDS.pick,
      CAST_WORDS.looksLabel,
      CAST_WORDS.looksHint,
      CAST_WORDS.back,
      CAST_WORDS.shot,
      CAST_WORDS.placement,
      CAST_WORDS.sample.title,
      CAST_WORDS.sample.body,
      ...Object.values(CAST_WORDS.characters).map((c) => c.name),
      ...Object.values(CAST_WORDS.shots),
      ...Object.values(CAST_WORDS.placements),
      ...HOST_CHARACTERS.flatMap((who) => [
        CAST_WORDS.looks(who),
        ...looksOf(who).flatMap((look) => [
          lookName(look),
          CAST_WORDS.pictured(look, "long", "top-left"),
        ]),
      ]),
    ]
    expect(lines.filter((line) => MACHINERY.test(line))).toEqual([])
    expect(lines.filter((line) => line.trim() === "")).toEqual([])
  })

  it("names the members by what they are, never by their code names", () => {
    for (const who of HOST_CHARACTERS) {
      expect(CAST_WORDS.characters[who].name).not.toContain("-")
      for (const look of looksOf(who)) expect(lookName(look)).not.toContain("-")
    }
  })
})
