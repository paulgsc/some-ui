/**
 * Conjugation both ways, and the rebuild check (KPLAY's KP2, #2851).
 *
 * Forward: a listed verb or adjective, a construction from the catalogue
 * (`constructions`) and a tense give the surface word: 오다 + -아서/어서 →
 * 와서, 살다 + -는 동안 → 사는 동안. Backward: a surface word gives every
 * reading that rebuilds it, character for character, or, when none does, the
 * rule a near miss breaks: 왔어서 puts the past before -아서/어서, 이워서 takes
 * 입다 for ㅂ-irregular, 춥어요 takes 춥다 for regular.
 *
 * The stem's own changes (the irregular classes, 으 dropping, contraction,
 * the 아/어 choice, the past) are `@dongsa/conjugation`'s, given the
 * vocabulary list's flag (call C1086). This module adds only what is ours:
 * how each catalogue ending meets the stem it gets back, the constraints the
 * catalogue states, and the check that a claimed split rebuilds. Pure.
 */

import {
  base,
  base3,
  declarativePresentInformalLow,
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
 * What ends the word: a construction from the catalogue, or the polite
 * present -아요/어요 (the form the mistake catalogue's irregular entries are
 * about).
 */
type Ending = ConstructionId | "polite"

type Tense = "none" | "past" | "future"

export type Reading = { dictionary: Dictionary; ending: Ending; tense: Tense }

/** A rule a near miss breaks, named. */
export type Breach =
  /** A tense the ending does not take before it: 왔어서. */
  | { rule: "tense"; ending: ConstructionId; tense: "past" | "future" }
  /** A kind of stem the ending does not take: 크느라고. */
  | { rule: "stem"; ending: ConstructionId }
  /** An irregular word conjugated as regular: 춥어요. */
  | { rule: "irregular"; irregular: IrregularClass; mistake?: MistakeId }
  /** A regular word conjugated as irregular: 이워서. */
  | { rule: "regular"; as: "ㅂ" | "ㄷ" }

export type Analysis =
  | { kind: "split"; readings: Array<Reading> }
  | { kind: "refused"; reading: Reading; breach: Breach; correct: string }
  | { kind: "unknown" }

/** How the stem is conjugated: as listed, or as a learner might mistake it. */
type StemRule = "listed" | "regular" | "ㅂ" | "ㄷ"

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
  으: "eu-kept",
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
  VOCABULARY[dictionary].irregular === null ||
  VOCABULARY[dictionary].irregular === "으"

const lastOf = (text: string): string => text.charAt(text.length - 1)

const withFinal = (text: string, final: number): string => {
  const last = syllableOf(lastOf(text))
  if (last === null) throw new RangeError(`not a Hangul syllable: ${text}`)
  const code = SYLLABLES + (last.initial * 21 + last.medial) * 28 + final
  return text.slice(0, -1) + String.fromCodePoint(code)
}

const finalOf = (text: string): number => syllableOf(lastOf(text))?.final ?? 0

/** The stem as listed, or with ㅂ or ㄷ mistakenly changed. */
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
  const liquid = VOCABULARY[dictionary].irregular === "ㄹ"
  if (rule === "ㅂ" || rule === "ㄷ") {
    const text = mistaken(String(base(dictionary)), rule)
    return { text, consonant: rule === "ㄷ", liquid: false }
  }
  return stemOf(base3(dictionary, isRegular(dictionary, rule)), liquid)
}

/** The stem before consonant endings: the dictionary form without 다. */
const plainStem = (dictionary: Dictionary): Stem =>
  stemOf(base(dictionary), VOCABULARY[dictionary].irregular === "ㄹ")

/** The 아/어 form: 와 (오다), 추워 (춥다), 해 (하다), 몰라 (모르다). */
const vowelForm = (dictionary: Dictionary, rule: StemRule): string => {
  if (rule === "ㅂ" || rule === "ㄷ")
    return merge(mistaken(String(base(dictionary)), rule), "어")
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
  if (stem.liquid && syllableOf(first)?.initial === INITIAL_N) {
    // ㄹ drops before ㄴ: 사니까, 노느라고, 사는 동안.
    return withFinal(stem.text, 0) + ending
  }
  return stem.text + ending
}

const attachSimple = (
  dictionary: Dictionary,
  rule: StemRule,
  how: SimpleAttachment
): string => {
  switch (how.kind) {
    case "plain": {
      return attach(plainStem(dictionary), how.ending)
    }
    case "batchim": {
      const stem = euStem(dictionary, rule)
      return attach(stem, stem.consonant ? how.afterConsonant : how.afterVowel)
    }
    case "harmony": {
      // The 아/어 form carries the vowel; the ending's tail follows it.
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
    ? rule === "ㅂ" || rule === "ㄷ"
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
  if (ending === "polite") {
    const form =
      tense === "none"
        ? vowelForm(dictionary, rule)
        : merge(tensed(dictionary, rule, tense), "어")
    return `${form}요`
  }
  const { attach: how, constraints } = CONSTRUCTIONS[ending]
  if (tense !== "none") {
    // After 았, 었 and 겠 the form no longer depends on the stem.
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
  if (ending === "polite") return null
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

const ENDINGS: ReadonlyArray<Ending> = [...CONSTRUCTION_IDS, "polite"]
const TENSES: ReadonlyArray<Tense> = ["none", "past", "future"]

const readingsOf = function* (): Generator<Reading> {
  for (const dictionary of Object.keys(VOCABULARY).filter(isListed))
    for (const ending of ENDINGS)
      for (const tense of TENSES) yield { dictionary, ending, tense }
}

/** The ways a word may be mistaken, in the order they are tried. */
const MISTAKEN_RULES: ReadonlyArray<StemRule> = ["regular", "ㅂ", "ㄷ"]

const ruleBreach = (dictionary: Dictionary, rule: StemRule): Breach | null => {
  const irregular = VOCABULARY[dictionary].irregular
  if (rule === "regular" && irregular !== null && irregular !== "으") {
    const mistake = IRREGULAR_MISTAKE[irregular]
    return mistake
      ? { rule: "irregular", irregular, mistake }
      : { rule: "irregular", irregular }
  }
  // Only a stem that ends in ㅂ or ㄷ can be mistaken for that class.
  const final = finalOf(String(base(dictionary)))
  if (rule === "ㅂ" && irregular === null && final === FINAL_B)
    return { rule: "regular", as: rule }
  if (rule === "ㄷ" && irregular === null && final === FINAL_D)
    return { rule: "regular", as: rule }
  return null
}

/**
 * Every reading of a surface word that rebuilds it and keeps the catalogue's
 * constraints; or, when there is none, the first near miss and the rule it
 * breaks; or unknown.
 */
export const analyse = (surface: string): Analysis => {
  const readings: Array<Reading> = []
  let refused: Analysis | null = null
  for (const reading of readingsOf()) {
    if (conjugate(reading) === surface) {
      const breach = breachOf(reading)
      if (breach === null) readings.push(reading)
      else
        refused ??= {
          kind: "refused",
          reading,
          breach,
          correct: conjugate({ ...reading, tense: "none" }),
        }
    }
  }
  if (readings.length > 0) return { kind: "split", readings }
  if (refused !== null) return refused
  for (const rule of MISTAKEN_RULES) {
    for (const reading of readingsOf()) {
      const breach = ruleBreach(reading.dictionary, rule)
      if (breach === null || breachOf(reading) !== null) continue
      if (build(reading, rule) === surface)
        return { kind: "refused", reading, breach, correct: conjugate(reading) }
    }
  }
  return { kind: "unknown" }
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
