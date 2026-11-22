// Runs `@dongsa/conjugation` itself: nothing here is mocked.
import {
  base,
  isDIrregular,
  isHIrregular,
  isLEuhIrregular,
  isLIrregular,
  isPIrregular,
  isSIrregular,
} from "@dongsa/conjugation"
import {
  analyse,
  check,
  conjugate,
  type Reading,
} from "@topik/lib/topik/conjugation"
import {
  isListed,
  VOCABULARY,
  type IrregularClass,
} from "@topik/lib/topik/conjugation/vocabulary"
import {
  CONSTRUCTION_IDS,
  CONSTRUCTIONS,
  type SimpleAttachment,
} from "@topik/lib/topik/constructions"
import { describe, expect, it } from "vitest"

type Case = [Reading["dictionary"], Reading["ending"], Reading["tense"], string]

/** One row per stem shape and ending shape, every irregular class included. */
const CASES: ReadonlyArray<Case> = [
  ["가다", "conn.aseo.cause", "none", "가서"],
  ["오다", "conn.aseo.cause", "none", "와서"],
  ["먹다", "conn.aseo.cause", "none", "먹어서"],
  ["하다", "conn.aseo.cause", "none", "해서"],
  ["공부하다", "conn.aseo.cause", "none", "공부해서"],
  ["마시다", "conn.aseo.cause", "none", "마셔서"],
  ["놓치다", "polite", "past", "놓쳤어요"],
  ["받다", "conn.aseo.cause", "none", "받아서"],
  ["입다", "conn.aseo.cause", "none", "입어서"],
  // ㅂ
  ["춥다", "conn.aseo.cause", "none", "추워서"],
  ["춥다", "conn.nikka.cause", "none", "추우니까"],
  ["춥다", "conn.l-ttae.time", "none", "추울 때"],
  ["덥다", "conn.neunde.contrast", "none", "더운데"],
  // ㄷ
  ["듣다", "conn.aseo.cause", "none", "들어서"],
  ["듣다", "conn.nikka.cause", "none", "들으니까"],
  ["듣다", "conn.myeonseo.time", "none", "들으면서"],
  ["걷다", "conn.l-ttae.time", "none", "걸을 때"],
  // 르
  ["모르다", "conn.aseo.cause", "none", "몰라서"],
  ["부르다", "polite", "none", "불러요"],
  ["빠르다", "conn.aseo.cause", "none", "빨라서"],
  // 으
  ["바쁘다", "conn.aseo.cause", "none", "바빠서"],
  ["크다", "polite", "none", "커요"],
  ["쓰다", "conn.aseo.cause", "none", "써서"],
  ["아프다", "conn.nikka.cause", "none", "아프니까"],
  // ㅅ
  ["낫다", "conn.myeon.condition", "none", "나으면"],
  ["짓다", "conn.aseo.cause", "none", "지어서"],
  // ㅎ
  ["그렇다", "conn.neunde.contrast", "none", "그런데"],
  ["빨갛다", "conn.aseo.cause", "none", "빨개서"],
  // ㄹ
  ["살다", "conn.nikka.cause", "none", "사니까"],
  ["살다", "conn.myeon.condition", "none", "살면"],
  ["살다", "conn.neun-dongan.time", "none", "사는 동안"],
  ["살다", "conn.l-ttae.time", "none", "살 때"],
  ["살다", "conn.damyeon.condition", "none", "산다면"],
  ["놀다", "conn.reo.purpose", "none", "놀러"],
  ["놀다", "conn.neurago.cause", "none", "노느라고"],
  ["만들다", "conn.n-hue.time", "none", "만든 후에"],
  ["길다", "conn.neunde.contrast", "none", "긴데"],
  // -(으) endings, by-class endings, and after the past and -겠-
  ["가다", "conn.l-ttae.time", "none", "갈 때"],
  ["먹다", "conn.l-ttae.time", "none", "먹을 때"],
  ["가다", "conn.n-hue.time", "none", "간 후에"],
  ["먹다", "conn.n-hue.time", "none", "먹은 후에"],
  ["좋다", "conn.neunde.contrast", "none", "좋은데"],
  ["비싸다", "conn.neunde.contrast", "none", "비싼데"],
  ["있다", "conn.neunde.contrast", "none", "있는데"],
  ["맛있다", "conn.neunde.contrast", "none", "맛있는데"],
  ["가다", "conn.damyeon.condition", "none", "간다면"],
  ["먹다", "conn.damyeon.condition", "none", "먹는다면"],
  ["좋다", "conn.damyeon.condition", "none", "좋다면"],
  // 는다면 starts with a consonant, so no stem changes before it.
  ["듣다", "conn.damyeon.condition", "none", "듣는다면"],
  ["걷다", "conn.damyeon.condition", "none", "걷는다면"],
  ["낫다", "conn.damyeon.condition", "none", "낫는다면"],
  ["짓다", "conn.damyeon.condition", "none", "짓는다면"],
  ["가다", "conn.l-ttae.time", "past", "갔을 때"],
  ["가다", "conn.ado.contrast", "past", "갔어도"],
  ["좋다", "conn.neunde.contrast", "past", "좋았는데"],
  ["가다", "conn.damyeon.condition", "past", "갔다면"],
  ["가다", "conn.nikka.cause", "past", "갔으니까"],
  ["가다", "conn.jiman.contrast", "future", "가겠지만"],
  ["기다리다", "conn.neun-dongan.time", "none", "기다리는 동안"],
  ["도착하다", "conn.jamaja.time", "none", "도착하자마자"],
  ["배우다", "conn.ryeogo.purpose", "none", "배우려고"],
  ["지키다", "conn.gi-wihaeseo.purpose", "none", "지키기 위해서"],
]

const reading = ([dictionary, ending, tense]: Case): Reading => ({
  dictionary,
  ending,
  tense,
})

describe("conjugation", () => {
  it.each(CASES)("%s + %s (%s) → %s", (...row) => {
    expect(conjugate(reading(row))).toBe(row[3])
  })

  it.each(CASES)("reads %s + %s (%s) back from %s", (...row) => {
    const analysis = analyse(row[3])
    expect(analysis.kind).toBe("split")
    if (analysis.kind === "split")
      expect(analysis.readings).toContainEqual(reading(row))
  })

  it("refuses 왔어서: -아서/어서 takes no past before it", () => {
    expect(analyse("왔어서")).toEqual({
      kind: "refused",
      reading: { dictionary: "오다", ending: "conn.aseo.cause", tense: "past" },
      breach: { rule: "tense", ending: "conn.aseo.cause", tense: "past" },
      correct: "와서",
    })
  })

  it("refuses 크느라고: -느라고 takes no adjective", () => {
    expect(analyse("크느라고")).toEqual({
      kind: "refused",
      reading: {
        dictionary: "크다",
        ending: "conn.neurago.cause",
        tense: "none",
      },
      breach: { rule: "stem", ending: "conn.neurago.cause" },
    })
  })

  it.each([
    [
      "이워서",
      "입다",
      "conn.aseo.cause",
      { rule: "regular", as: "ㅂ" },
      "입어서",
    ],
    [
      "춥어요",
      "춥다",
      "polite",
      { rule: "irregular", irregular: "ㅂ", mistake: "b-irregular" },
      "추워요",
    ],
    [
      "듣어서",
      "듣다",
      "conn.aseo.cause",
      { rule: "irregular", irregular: "ㄷ", mistake: "d-irregular" },
      "들어서",
    ],
    [
      "발아서",
      "받다",
      "conn.aseo.cause",
      { rule: "regular", as: "ㄷ" },
      "받아서",
    ],
    [
      "크어요",
      "크다",
      "polite",
      { rule: "irregular", irregular: "으", mistake: "eu-kept" },
      "커요",
    ],
    [
      "모르어서",
      "모르다",
      "conn.aseo.cause",
      { rule: "irregular", irregular: "르", mistake: "reu-irregular" },
      "몰라서",
    ],
    [
      "모라서",
      "모르다",
      "conn.aseo.cause",
      { rule: "irregular", irregular: "르", mistake: "reu-irregular" },
      "몰라서",
    ],
    [
      "살으니까",
      "살다",
      "conn.nikka.cause",
      { rule: "irregular", irregular: "ㄹ" },
      "사니까",
    ],
    [
      "살는 동안",
      "살다",
      "conn.neun-dongan.time",
      { rule: "irregular", irregular: "ㄹ" },
      "사는 동안",
    ],
  ] as const)(
    "refuses %s, a mistaken %s",
    (surface, dictionary, ending, breach, correct) => {
      expect(analyse(surface)).toEqual({
        kind: "refused",
        reading: { dictionary, ending, tense: "none" },
        breach,
        correct,
      })
    }
  )

  it("knows no reading of a word it cannot rebuild", () => {
    expect(analyse("가가가")).toEqual({ kind: "unknown" })
  })
})

describe("the rebuild check", () => {
  const claim: Reading = {
    dictionary: "가다",
    ending: "conn.aseo.cause",
    tense: "none",
  }

  it("keeps a split that rebuilds the word", () => {
    expect(check(claim, "가서")).toEqual({ kind: "kept" })
  })

  it("refuses a split that does not rebuild it, character for character", () => {
    expect(check(claim, "가써")).toEqual({
      kind: "refused",
      breach: { rule: "rebuild" },
      rebuilt: "가서",
    })
  })

  it("refuses a split that breaks the construction's constraints", () => {
    expect(check({ ...claim, tense: "past" }, "갔어서")).toEqual({
      kind: "refused",
      breach: { rule: "tense", ending: "conn.aseo.cause", tense: "past" },
    })
  })
})

describe("what joining assumes of the catalogue", () => {
  const attachments = CONSTRUCTION_IDS.flatMap(
    (id): Array<SimpleAttachment> => {
      const { attach } = CONSTRUCTIONS[id]
      return attach.kind === "by-class"
        ? [attach.verb, attach.adjective, attach.existence, attach.copula]
        : [attach]
    }
  )

  it("starts no ending with ㅂ or ㅅ, before which ㄹ would drop", () => {
    for (const how of attachments) {
      const form =
        how.kind === "plain"
          ? how.ending
          : how.kind === "batchim"
            ? how.afterVowel
            : ""
      expect(form).not.toMatch(/^[바-빟사-싷]/)
    }
  })

  it("gives every harmony ending one tail after 아, 어 and 여", () => {
    for (const how of attachments) {
      if (how.kind !== "harmony") continue
      expect(how.bright.slice(1)).toBe(how.dark.slice(1))
      expect(how.ha.slice(1)).toBe(how.dark.slice(1))
    }
  })
})

/** The class the library gives a word on its own judgment. */
const libraryClass = (dictionary: string): IrregularClass | null => {
  const stem = String(base(dictionary))
  if (isPIrregular(stem)) return "ㅂ"
  if (isDIrregular(stem)) return "ㄷ"
  if (isLEuhIrregular(stem)) return "르"
  if (isSIrregular(stem)) return "ㅅ"
  if (isHIrregular(stem)) return "ㅎ"
  if (isLIrregular(stem)) return "ㄹ"
  // 으 drops by rule; the library has no flag for it.
  // A last syllable of ㅡ and no final ends, decomposed, in the vowel ᅳ.
  return stem.normalize("NFD").endsWith("\u1173") ? "으" : null
}

describe("the vocabulary list", () => {
  it.each(Object.keys(VOCABULARY).filter(isListed))(
    "classes %s as the library does",
    (dictionary) => {
      expect(VOCABULARY[dictionary].irregular).toBe(libraryClass(dictionary))
    }
  )
})
