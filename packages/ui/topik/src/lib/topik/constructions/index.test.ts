import {
  CONSTRUCTION_IDS,
  CONSTRUCTIONS,
  type Shelf,
} from "@topik/lib/topik/constructions"
import { describe, expect, it } from "vitest"

/**
 * Every identifier that has landed, in order. An identifier is identity
 * (canon Def. 1.3): this list only grows, and a new entry is added to its end
 * here and in `CONSTRUCTION_IDS` together.
 */
const LANDED = [
  "conn.aseo.cause",
  "conn.nikka.cause",
  "conn.gi-ttaemune.cause",
  "conn.neurago.cause",
  "conn.neun-barame.cause",
  "conn.myeon.condition",
  "conn.damyeon.condition",
  "conn.l-ttae.time",
  "conn.gi-jeone.time",
  "conn.n-hue.time",
  "conn.go-naseo.time",
  "conn.jamaja.time",
  "conn.neun-dongan.time",
  "conn.myeonseo.time",
  "conn.jiman.contrast",
  "conn.neunde.contrast",
  "conn.ado.contrast",
  "conn.reo.purpose",
  "conn.ryeogo.purpose",
  "conn.gi-wihaeseo.purpose",
  "close.ayo.plain",
  "close.a.plain",
  "close.jiyo.checking",
  "close.ji.checking",
  "close.neyo.noticing",
  "close.ne.noticing",
  "close.lkkayo.proposing",
  "close.lkka.proposing",
  "close.seyo.asking",
]

const SHELVES: ReadonlyArray<Shelf> = [
  "cause",
  "condition",
  "time",
  "contrast",
  "purpose",
]

/** The by-class endings' forms after 았, 었 and 겠: 좋았는데, 갔다면. */
const BY_CLASS_AFTER_TENSE = new Map<string, string>([
  ["conn.neunde.contrast", "는데"],
  ["conn.damyeon.condition", "다면"],
])

const entries = CONSTRUCTION_IDS.map((id) => [id, CONSTRUCTIONS[id]] as const)

describe("the construction catalogue", () => {
  it("keeps every identifier that has landed, in place", () => {
    expect(CONSTRUCTION_IDS.slice(0, LANDED.length)).toEqual(LANDED)
    expect(new Set(CONSTRUCTION_IDS).size).toBe(CONSTRUCTION_IDS.length)
  })

  it("holds exactly the listed identifiers", () => {
    expect(Object.keys(CONSTRUCTIONS).sort()).toEqual(
      [...CONSTRUCTION_IDS].sort()
    )
  })

  it("names its kind and first meaning in each identifier", () => {
    const prefix = { joining: "conn", closing: "close" } as const
    for (const [id, { kind, meanings }] of entries) {
      expect(id.split(".")[0], id).toBe(prefix[kind])
      expect(id.split(".").at(-1), id).toBe(meanings[0])
    }
  })

  it("keeps something on every shelf", () => {
    for (const shelf of SHELVES) {
      expect(
        entries.some(([, { meanings }]) => meanings[0] === shelf),
        shelf
      ).toBe(true)
    }
  })

  it("names neighbours other than itself, once each", () => {
    for (const [id, { neighbours }] of entries) {
      const ids = neighbours.map((n) => n.id)
      expect(ids, id).not.toContain(id)
      expect(new Set(ids).size, id).toBe(ids.length)
    }
  })

  it("after -았/었- and -겠-, takes the 어 form or the after-consonant form", () => {
    // 았, 었 and 겠 end in a consonant, and are always followed by the 어 form.
    for (const [id, { attach, constraints }] of entries) {
      if (constraints.before === null) continue
      const expected = {
        harmony: attach.kind === "harmony" ? attach.dark : undefined,
        batchim: attach.kind === "batchim" ? attach.afterConsonant : undefined,
        plain: attach.kind === "plain" ? attach.ending : undefined,
        "by-class": BY_CLASS_AFTER_TENSE.get(id),
      }[attach.kind]
      expect(constraints.before.ending, id).toBe(expected)
    }
  })

  it("lists each stem class once, and at least one", () => {
    for (const [id, { constraints }] of entries) {
      expect(constraints.takes.length, id).toBeGreaterThan(0)
      expect(new Set(constraints.takes).size, id).toBe(constraints.takes.length)
    }
  })

  it("writes its twins and examples in Hangul", () => {
    const hangul = /^[가-힣 ]+$/
    for (const [id, entry] of entries) {
      if (entry.kind === "joining")
        for (const twin of entry.twins) expect(twin, id).toMatch(hangul)
      expect(entry.example.ko, id).toMatch(/^[가-힣 ]+[.?]$/)
      expect(entry.example.en.length, id).toBeGreaterThan(0)
    }
  })

  it("closes in 반말 and in 해요 alike, each the other's neighbour", () => {
    // Every closing job but asking (-(으)세요, polite by its 시) has both.
    const closings = entries.flatMap(([id, entry]) =>
      entry.kind === "closing" ? [[id, entry] as const] : []
    )
    for (const [id, { meanings, register, neighbours }] of closings) {
      if (meanings[0] === "asking") continue
      const other = closings.find(
        ([, entry]) =>
          entry.meanings[0] === meanings[0] && entry.register !== register
      )
      expect(other, id).toBeDefined()
      expect(
        neighbours.map((n) => n.id),
        id
      ).toContain(other?.[0])
    }
  })

  it("ends each sentence in moods named once each", () => {
    for (const [id, entry] of entries) {
      if (entry.kind !== "closing") continue
      const { ends } = entry.constraints
      expect(new Set(ends).size, id).toBe(ends.length)
    }
  })
})
