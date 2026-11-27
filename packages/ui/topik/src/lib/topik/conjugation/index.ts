/**
 * Conjugation both ways, and the rebuild check (KPLAY's KP2, #2851).
 *
 * Forward: a listed word, a catalogue ending and a tense give the surface
 * word (오다 + -아서/어서 → 와서). Backward: a surface word gives every reading
 * that rebuilds it, or the rule a near miss breaks (`Breach`). The stem's own
 * changes are `@dongsa/conjugation`'s (call C1086); how an ending meets the
 * stem, the constraints and the check are ours.
 */

import {
  base,
  base3,
  declarativePresentInformalLow,
  dropL,
  merge,
  pastBase,
} from "@dongsa/conjugation"
import { assertNever } from "@some-ui/core-utils"
import {
  isListed,
  VOCABULARY,
  type Dictionary,
  type IrregularClass,
} from "@topik/lib/topik/conjugation/vocabulary"
import {
  CONSTRUCTION_IDS,
  CONSTRUCTIONS,
  type ConstructionId,
  type SimpleAttachment,
} from "@topik/lib/topik/constructions"
import type { MistakeId } from "@topik/lib/topik/read-aloud/mistakes"

/**
 * What ends the word: a construction from the catalogue, joining (와서) or
 * closing (와요, the form the mistake catalogue's irregular entries are about).
 */
type Ending = ConstructionId

type Tense = "none" | "past" | "future"

export type Reading = Readonly<{
  dictionary: Dictionary
  ending: Ending
  tense: Tense
}>

/** A rule a near miss breaks, named. */
export type Breach = Readonly<
  /** A tense the ending does not take before it: 왔어서. */
  | { rule: "tense"; ending: ConstructionId; tense: "past" | "future" }
  /** A kind of stem the ending does not take: 크느라고. */
  | { rule: "stem"; ending: ConstructionId }
  /** An irregular word conjugated as regular (춥어요), or kept whole (크어요). */
  | { rule: "irregular"; irregular: IrregularClass; mistake?: MistakeId }
  /** A regular word conjugated as irregular: 이워서. */
  | { rule: "regular"; as: "ㅂ" | "ㄷ" }
>

export type Analysis = Readonly<
  | { kind: "split"; readings: ReadonlyArray<Reading> }
  | {
      kind: "refused"
      reading: Reading
      breach: Breach
      /** The word as it should be, where the reading has one: 와서, 추워요. */
      correct?: string
    }
  | { kind: "unknown" }
>

/** How the stem is conjugated: as listed, or as a learner might mistake it. */
type StemRule =
  | "listed"
  /** As if regular, by the library's regular rules: 춥어요, 모라요. */
  | "regular"
  /** A 으 or 르 stem kept whole before 어: 크어요, 모르어서. */
  | "whole"
  /** A regular stem as if ㅂ- or ㄷ-irregular: 이워서, 발아서. */
  | "ㅂ"
  | "ㄷ"

/** A stem as an ending meets it. */
type Stem = {
  text: string
  /** Takes the after-consonant form: 먹, 들 (듣다), 나 (낫다). */
  consonant: boolean
  /** Ends in an ㄹ that drops before ㄴ and takes no 으: 살, 놀. */
  liquid: boolean
}

const IRREGULAR_MISTAKE: Partial<Record<IrregularClass, MistakeId>> = {
  ㅂ: "b-irregular",
  ㄷ: "d-irregular",
  르: "reu-irregular",
}

/*
 * Hangul by arithmetic: a syllable is 0xAC00 + (initial × 21 + medial) × 28
 * + final, where a final of 0 is none.
 */
const SYLLABLES = 0xac00
const SYLLABLE_COUNT = 11172
const FINAL_N = 4
const FINAL_L = 8
const FINAL_SS = 20
const FINAL_B = 17
const FINAL_D = 7
const INITIAL_N = 2
const INITIAL_S = 9
const INITIAL_NG = 11

type Syllable = { initial: number; medial: number; final: number }

const syllableOf = (character: string): Syllable | null => {
  const n = (character.codePointAt(0) ?? 0) - SYLLABLES
  if (n < 0 || n >= SYLLABLE_COUNT) return null
  return {
    initial: Math.floor(n / 588),
    medial: Math.floor((n % 588) / 28),
    final: n % 28,
  }
}

/** The catalogue's lone ㄴ and ㄹ, as finals. */
const FINAL: Record<string, number> = { ㄴ: FINAL_N, ㄹ: FINAL_L }

const isRegular = (dictionary: Dictionary, rule: StemRule): boolean =>
  rule === "regular" ||
  rule === "whole" ||
  VOCABULARY[dictionary].irregular === null ||
  VOCABULARY[dictionary].irregular === "으"

/** Whether the stem's ㄹ drops and takes no 으, as listed: not when mistaken. */
const isLiquid = (dictionary: Dictionary, rule: StemRule): boolean =>
  rule === "listed" && VOCABULARY[dictionary].irregular === "ㄹ"

const keptWhole = (dictionary: Dictionary, rule: StemRule): boolean => {
  const { irregular } = VOCABULARY[dictionary]
  return rule === "whole" && (irregular === "으" || irregular === "르")
}

const lastOf = (text: string): string => text.charAt(text.length - 1)

const withFinal = (text: string, final: number): string => {
  const last = syllableOf(lastOf(text))
  if (last === null) throw new RangeError(`not a Hangul syllable: ${text}`)
  const code = SYLLABLES + (last.initial * 21 + last.medial) * 28 + final
  return text.slice(0, -1) + String.fromCodePoint(code)
}

const finalOf = (text: string): number => syllableOf(lastOf(text))?.final ?? 0

const mistaken = (stem: string, as: "ㅂ" | "ㄷ"): string =>
  as === "ㅂ" ? `${withFinal(stem, 0)}우` : withFinal(stem, FINAL_L)

/**
 * The library hands back an ㅅ-irregular stem with a hidden final (나 for
 * 낫다, which takes 으: 나으면) and a ㄷ-irregular one with its original
 * final (들 for 듣다, whose ㄹ does not drop: 들으니까).
 */
const stemOf = (text: ReturnType<typeof base3>, liquid: boolean): Stem => {
  const final = finalOf(String(text))
  const hidden = typeof text !== "string" && text.hiddenPadchim
  const original = typeof text !== "string" && text.originalPadchim !== null
  return {
    text: String(text),
    consonant: hidden || (final !== 0 && !(liquid && final === FINAL_L)),
    liquid: liquid && final === FINAL_L && !original,
  }
}

/** The stem before -(으) endings: 추우 (춥다), 들 (듣다), 그러 (그렇다). */
const euStem = (dictionary: Dictionary, rule: StemRule): Stem => {
  const liquid = isLiquid(dictionary, rule)
  if (rule === "ㅂ" || rule === "ㄷ") {
    const text = mistaken(String(base(dictionary)), rule)
    return { text, consonant: rule === "ㄷ", liquid: false }
  }
  return stemOf(base3(dictionary, isRegular(dictionary, rule)), liquid)
}

const plainStem = (dictionary: Dictionary, rule: StemRule): Stem =>
  stemOf(base(dictionary), isLiquid(dictionary, rule))

/** The 아/어 form: 와 (오다), 추워 (춥다), 해 (하다), 몰라 (모르다). */
const vowelForm = (dictionary: Dictionary, rule: StemRule): string => {
  const stem = String(base(dictionary))
  if (rule === "ㅂ") return merge(mistaken(stem, rule), "어")
  if (rule === "ㄷ") {
    // The library's own 아/어 choice, on the stem as written: 받 → 아.
    const regular = declarativePresentInformalLow(dictionary, true, true)
    return mistaken(stem, rule) + regular.slice(stem.length)
  }
  if (keptWhole(dictionary, rule)) return `${stem}어`
  return declarativePresentInformalLow(
    dictionary,
    isRegular(dictionary, rule),
    true
  )
}

/** An ending met by a stem: the catalogue's form, joined as Hangul joins. */
const attach = (stem: Stem, ending: string): string => {
  const first = ending.charAt(0)
  const final = FINAL[first]
  if (final !== undefined) {
    // A lone ㄴ or ㄹ becomes the stem's final consonant: 갈 때, 산 후에.
    return withFinal(stem.text, final) + ending.slice(1)
  }
  // ㄹ drops before a syllable starting with ㄴ or ㅅ: 사니까, 노느라고,
  // 사네요, 사세요. It also drops before a final ㅂ (삽니다), which no
  // catalogue ending writes (held by the test).
  const initial = syllableOf(first)?.initial
  if (stem.liquid && (initial === INITIAL_N || initial === INITIAL_S))
    return dropL(stem.text, ending) ?? stem.text + ending
  return stem.text + ending
}

const attachSimple = (
  dictionary: Dictionary,
  rule: StemRule,
  how: SimpleAttachment
): string => {
  switch (how.kind) {
    case "plain": {
      return attach(plainStem(dictionary, rule), how.ending)
    }
    case "batchim": {
      // A consonant stem meets a 으-form (먹으니까), where the irregular
      // classes change it (들으니까), or a consonant-initial one (먹는다면),
      // where they don't (듣는다면).
      const plain = plainStem(dictionary, rule)
      if (
        plain.consonant &&
        syllableOf(how.afterConsonant)?.initial !== INITIAL_NG
      )
        return attach(plain, how.afterConsonant)
      const stem = euStem(dictionary, rule)
      return attach(stem, stem.consonant ? how.afterConsonant : how.afterVowel)
    }
    case "harmony": {
      // The 아/어 form carries the vowel; the ending's tail, the same after
      // 아, 어 and 여 in every harmony ending (held by the test), follows it.
      return vowelForm(dictionary, rule) + how.dark.slice(1)
    }
    default: {
      return assertNever(how)
    }
  }
}

/** The stem with its tense marker: 갔 (가다, past), 가겠 (future). */
const tensed = (
  dictionary: Dictionary,
  rule: StemRule,
  tense: Exclude<Tense, "none">
): string =>
  tense === "past"
    ? rule === "ㅂ" || rule === "ㄷ" || keptWhole(dictionary, rule)
      ? withFinal(vowelForm(dictionary, rule), FINAL_SS)
      : pastBase(dictionary, isRegular(dictionary, rule))
    : `${String(base(dictionary))}겠`

/**
 * The surface word for a reading, conjugated by `rule`: as the vocabulary
 * list says, or as a learner might mistake it. Constraints are not applied
 * here; `analyse` and `check` apply them.
 */
const build = (reading: Reading, rule: StemRule): string => {
  const { dictionary, ending, tense } = reading
  const { attach: how, constraints } = CONSTRUCTIONS[ending]
  if (tense !== "none") {
    const after = constraints.before?.ending ?? stemlessForm(how)
    return tensed(dictionary, rule, tense) + after
  }
  if (how.kind !== "by-class") return attachSimple(dictionary, rule, how)
  return attachSimple(dictionary, rule, how[VOCABULARY[dictionary].class])
}

/** An ending's form after a consonant, for a tense it refuses: 왔어서. */
const stemlessForm = (
  how: (typeof CONSTRUCTIONS)[ConstructionId]["attach"]
): string => {
  const simple = how.kind === "by-class" ? how.verb : how
  switch (simple.kind) {
    case "plain": {
      return simple.ending
    }
    case "batchim": {
      return simple.afterConsonant
    }
    case "harmony": {
      return simple.dark
    }
    default: {
      return assertNever(simple)
    }
  }
}

/** The surface word for a reading, as the vocabulary list conjugates it. */
export const conjugate = (reading: Reading): string => build(reading, "listed")

/** Which of the catalogue's word-level constraints a reading breaks, if any. */
const breachOf = (reading: Reading): Breach | null => {
  const { dictionary, ending, tense } = reading
  const { constraints } = CONSTRUCTIONS[ending]
  const { class: stemClass } = VOCABULARY[dictionary]
  if (!constraints.takes.some((taken) => taken === stemClass))
    return { rule: "stem", ending }
  if (tense === "past" && constraints.before === null)
    return { rule: "tense", ending, tense }
  if (tense === "future" && !constraints.before?.future)
    return { rule: "tense", ending, tense }
  return null
}

const ENDINGS: ReadonlyArray<Ending> = CONSTRUCTION_IDS
const TENSES: ReadonlyArray<Tense> = ["none", "past", "future"]

const readingsOf = function* (): Generator<Reading> {
  for (const dictionary of Object.keys(VOCABULARY).filter(isListed))
    for (const ending of ENDINGS)
      for (const tense of TENSES) yield { dictionary, ending, tense }
}

/** The ways a word may be mistaken, in the order they are tried. */
const MISTAKEN_RULES: ReadonlyArray<Exclude<StemRule, "listed">> = [
  "regular",
  "whole",
  "ㅂ",
  "ㄷ",
]

const ruleBreach = (
  dictionary: Dictionary,
  rule: Exclude<StemRule, "listed">
): Breach | null => {
  const { irregular } = VOCABULARY[dictionary]
  if (rule === "whole") {
    if (irregular === "으")
      return { rule: "irregular", irregular, mistake: "eu-kept" }
    if (irregular === "르")
      return { rule: "irregular", irregular, mistake: "reu-irregular" }
    return null
  }
  if (rule === "regular") {
    // A 으 stem is already conjugated by the regular rules: only "whole" errs.
    if (irregular === null || irregular === "으") return null
    const mistake = IRREGULAR_MISTAKE[irregular]
    return mistake
      ? { rule: "irregular", irregular, mistake }
      : { rule: "irregular", irregular }
  }
  // Only a regular stem that ends in ㅂ or ㄷ can be mistaken for that class.
  if (irregular !== null) return null
  const final = finalOf(String(base(dictionary)))
  return final === (rule === "ㅂ" ? FINAL_B : FINAL_D)
    ? { rule: "regular", as: rule }
    : null
}

type Refusal = Extract<Analysis, { kind: "refused" }>

type Index = {
  /** Each surface the list builds, and every reading that builds it. */
  listed: Map<string, ReadonlyArray<Reading>>
  /** Each surface a mistaken rule builds, and the first such refusal. */
  mistaken: Map<string, Refusal>
}

let built: Index | null = null

const buildIndex = (): Index => {
  const listed = new Map<string, Array<Reading>>()
  const mistaken = new Map<string, Refusal>()
  for (const reading of readingsOf()) {
    const surface = conjugate(reading)
    listed.set(surface, [...(listed.get(surface) ?? []), reading])
  }
  for (const rule of MISTAKEN_RULES) {
    for (const reading of readingsOf()) {
      const breach = ruleBreach(reading.dictionary, rule)
      if (breach === null || breachOf(reading) !== null) continue
      const surface = build(reading, rule)
      if (!mistaken.has(surface))
        mistaken.set(surface, {
          kind: "refused",
          reading,
          breach,
          correct: conjugate(reading),
        })
    }
  }
  return { listed, mistaken }
}

const refusalOf = (reading: Reading, breach: Breach): Refusal =>
  breach.rule === "tense"
    ? {
        kind: "refused",
        reading,
        breach,
        correct: conjugate({ ...reading, tense: "none" }),
      }
    : { kind: "refused", reading, breach }

/**
 * Every reading of a surface word that rebuilds it and keeps the catalogue's
 * constraints; or, when there is none, the first near miss and the rule it
 * breaks; or unknown. Only listed words are read: an unlisted one is unknown,
 * or read as the listed word it is spelled like.
 */
export const analyse = (surface: string): Analysis => {
  built ??= buildIndex()
  const candidates = built.listed.get(surface) ?? []
  const readings = candidates.filter((reading) => breachOf(reading) === null)
  if (readings.length > 0) return { kind: "split", readings }
  for (const reading of candidates) {
    const breach = breachOf(reading)
    if (breach !== null) return refusalOf(reading, breach)
  }
  return built.mistaken.get(surface) ?? { kind: "unknown" }
}

/**
 * The rebuild check: a claimed split is kept only if it rebuilds the word
 * character for character and keeps the catalogue's constraints.
 */
export const check = (
  claim: Reading,
  surface: string
):
  | { kind: "kept" }
  | { kind: "refused"; breach: Breach }
  | { kind: "refused"; breach: { rule: "rebuild" }; rebuilt: string } => {
  const breach = breachOf(claim)
  if (breach !== null) return { kind: "refused", breach }
  const rebuilt = conjugate(claim)
  return rebuilt === surface
    ? { kind: "kept" }
    : { kind: "refused", breach: { rule: "rebuild" }, rebuilt }
}
