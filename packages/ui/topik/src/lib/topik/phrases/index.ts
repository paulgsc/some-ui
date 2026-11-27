/**
 * The phrase shelf (KPLAY's KP3, #2852): whole expressions as people say them,
 * each with the English wordings that mean it, who says it to whom, where, and
 * the parts it is built from, so the shop (KP4) can find one by a hunch in
 * English and a scene's focus can be proved from its parts.
 *
 * A phrase is a case of the authored Korean line (`read-aloud/content`): its
 * Korean, its words, and every run of Hangul in it accounted for by one of
 * its parts, in reading order (`hangulRuns`). A part is either a word written
 * as it stands (폰, 비가), or a predicate built from a listed word, a
 * catalogue ending and a tense (오다 + -아서/어서 → 와서), whose written form
 * conjugation (KP2) computes and refuses where it breaks a constraint.
 *
 * `checkPhrase` is the check an entry must pass before it is kept, whoever
 * wrote it: a session, or the routine's proposal (KP5). It returns every
 * fault, and none for a phrase it keeps:
 *
 * - the Korean is Hangul words, spaced, ending in one mark: "?" exactly when
 *   it asks (a question, or a proposal with -(으)ㄹ까), "." or "!" otherwise;
 * - the parts rebuild the Korean, run for run, and a word part is written in
 *   Hangul alone (no digits, Latin letters or punctuation);
 * - each built part keeps its ending's constraints;
 * - the last part is the predicate that ends the sentence, built with the
 *   one closing ending, in the phrase's register and a mood that ending can
 *   end; a command or a suggestion is of an action, in no tense;
 * - each joining ending gets what it requires and not a mood it refuses: the
 *   mood and the past (-는 바람에) are the predicate's that ends the sentence,
 *   also when another joining ending comes between (놓치는 바람에 걸어서
 *   왔어요); a verb of going or coming (-(으)러) is any predicate after it
 *   (사러 걸어서 가요, 사러 나가서 기다렸어요).
 *
 * Which Korean goes with which English is decided when the entry is written,
 * never translated live. An entry is `proposed` until the owner accepts it
 * (#2852), and nothing reads a proposed entry as accepted. `hear` says where
 * its audio comes from, always labelled; every entry starts as the AI voice,
 * and mining (KP7) and the voice (KP9) fill in native audio.
 */

import { assertNever } from "@some-ui/core-utils"
import {
  breachOf,
  conjugate,
  type Breach,
  type Reading,
} from "@topik/lib/topik/conjugation"
import {
  VOCABULARY,
  type Predicate,
} from "@topik/lib/topik/conjugation/vocabulary"
import {
  CONSTRUCTIONS,
  type ClauseMood,
  type ConstructionId,
  type Register,
} from "@topik/lib/topik/constructions"
import {
  hangulRuns,
  type ReadAloudWord,
} from "@topik/lib/topik/read-aloud/content"

/** A word written as it stands, with any particle on it: 폰, 비가. */
type WordPart = Readonly<
  { kind: "word"; written: string } & Pick<ReadAloudWord, "lemma" | "gloss">
>

/** A predicate built by conjugation: 오다 + -아서/어서 → 와서. */
type BuiltPart = Readonly<{ kind: "built"; reading: Reading; gloss: string }>

type Part = WordPart | BuiltPart

/** Who the phrase is said to, beside its register. */
type ToWhom = "yourself" | "a friend" | "anyone"

/**
 * Where the phrase's audio comes from: native speech from a real scene,
 * recorded for us, or from an open corpus; or the AI voice.
 */
type Hear = "native-scene" | "native-recorded" | "native-corpus" | "ai-voice"

/** Whether the owner has accepted the entry, and on which day. */
type Acceptance = "proposed" | Readonly<{ accepted: string }>

export type Phrase = Readonly<{
  korean: string
  /** English wordings that mean it, for the lookup: the first is its gloss. */
  intents: readonly [string, ...Array<string>]
  register: Register
  toWhom: ToWhom
  /** Where it is said, in a few words: everyday · looking for something. */
  setting: string
  /** What the sentence does: says, asks, tells or proposes. */
  mood: ClauseMood
  parts: ReadonlyArray<Part>
  hear: Hear
  status: Acceptance
}>

/** Something that keeps a phrase off the shelf. */
export type PhraseFault = Readonly<
  /** The Korean holds something besides spaced Hangul words and one end mark. */
  | { kind: "korean-not-hangul" }
  /** The end mark doesn't say whether the sentence asks: "?" or "." / "!". */
  | { kind: "mark"; asks: boolean }
  /** The parts don't write the Korean, run for run. */
  | {
      kind: "rebuild"
      written: ReadonlyArray<string>
      built: ReadonlyArray<string>
    }
  /** A word part written with something other than Hangul: 3, KTX, ?. */
  | { kind: "word-not-hangul"; part: number }
  /** A built part breaks its ending's constraints. */
  | { kind: "breach"; part: number; breach: Breach }
  /** The last part is not built with a closing ending. */
  | { kind: "unclosed" }
  /** A closing ending before the last part. */
  | { kind: "closed-early"; part: number }
  /** The closing ending's register is not the phrase's. */
  | { kind: "register"; closes: Register }
  /** The closing ending cannot end a sentence in the phrase's mood. */
  | { kind: "mood"; ends: ReadonlyArray<ClauseMood> }
  /** A command or a suggestion of something other than an action. */
  | { kind: "mood-stem" }
  /** A command or a suggestion in the past or with -겠-. */
  | { kind: "mood-tense" }
  /** A joining ending refuses the mood of the clause after it. */
  | { kind: "refused-mood"; part: number }
  /** A joining ending must be followed by a verb of going or coming. */
  | { kind: "then-movement"; part: number }
  /** A joining ending's sentence must end in the past. */
  | { kind: "then-past"; part: number }
>

/** A word part as written: one or more runs of Hangul, spaced. */
const HANGUL_WORDS = /^[가-힣]+(?: [가-힣]+)*$/

/** A phrase as written: Hangul words, spaced, and one end mark. */
const HANGUL_SENTENCE = /^[가-힣]+(?:,? [가-힣]+)*[.?!]$/

/** The closing endings that always ask, whatever the mood: -(으)ㄹ까(요). */
const PROPOSING: ReadonlySet<ConstructionId> = new Set<ConstructionId>([
  "close.lkkayo.proposing",
  "close.lkka.proposing",
])

/** The moods that ask the listener to act: of an action, in no tense. */
const ASKS: ReadonlySet<ClauseMood> = new Set(["command", "suggestion"])

const writtenOf = (part: Part): string => {
  switch (part.kind) {
    case "word": {
      return part.written
    }
    case "built": {
      return conjugate(part.reading)
    }
    default: {
      return assertNever(part)
    }
  }
}

const builtAt = (
  parts: ReadonlyArray<Part>
): ReadonlyArray<readonly [number, Reading]> =>
  parts.flatMap((part, index) =>
    part.kind === "built" ? [[index, part.reading] as const] : []
  )

/**
 * What each joining ending requires of the sentence after it: of the
 * predicate that ends the sentence (`main`, absent when none does), or, for
 * going or coming, of any predicate after it.
 */
const joiningFaults = (
  built: ReadonlyArray<readonly [number, Reading]>,
  main: Reading | undefined,
  mood: ClauseMood
): Array<PhraseFault> =>
  built.flatMap(([index, reading], position): Array<PhraseFault> => {
    const entry = CONSTRUCTIONS[reading.ending]
    if (entry.kind !== "joining") return []
    const faults: Array<PhraseFault> = []
    const { refuses, then } = entry.constraints
    if (refuses.some((refused) => refused === mood))
      faults.push({ kind: "refused-mood", part: index })
    const moves = built.slice(position + 1).some(([, later]) => {
      const predicate: Predicate = VOCABULARY[later.dictionary]
      return predicate.movement === true
    })
    if (then.verb === "movement" && !moves)
      faults.push({ kind: "then-movement", part: index })
    if (then.tense === "past" && main?.tense !== "past")
      faults.push({ kind: "then-past", part: index })
    return faults
  })

/** Every fault that keeps a phrase off the shelf; none for one it keeps. */
export const checkPhrase = (phrase: Phrase): ReadonlyArray<PhraseFault> => {
  const faults: Array<PhraseFault> = []
  const written = hangulRuns(phrase.korean)
  const built = phrase.parts.flatMap((part) => hangulRuns(writtenOf(part)))
  const sentence = HANGUL_SENTENCE.test(phrase.korean)
  if (!sentence) faults.push({ kind: "korean-not-hangul" })
  if (built.join(" ") !== written.join(" "))
    faults.push({ kind: "rebuild", written, built })
  phrase.parts.forEach((part, index) => {
    if (part.kind === "word" && !HANGUL_WORDS.test(part.written))
      faults.push({ kind: "word-not-hangul", part: index })
  })

  const readings = builtAt(phrase.parts)
  for (const [index, reading] of readings) {
    const breach = breachOf(reading)
    if (breach !== null) faults.push({ kind: "breach", part: index, breach })
  }

  const lastIndex = phrase.parts.length - 1
  for (const [index, reading] of readings) {
    if (CONSTRUCTIONS[reading.ending].kind === "closing" && index !== lastIndex)
      faults.push({ kind: "closed-early", part: index })
  }
  const last = readings.at(-1)
  const closing =
    last?.[0] === lastIndex ? CONSTRUCTIONS[last[1].ending] : undefined
  if (closing?.kind !== "closing") {
    faults.push({ kind: "unclosed" })
  } else {
    if (closing.register !== phrase.register)
      faults.push({ kind: "register", closes: closing.register })
    const { ends } = closing.constraints
    if (!ends.some((mood) => mood === phrase.mood))
      faults.push({ kind: "mood", ends })
    const asks =
      phrase.mood === "question" ||
      (last !== undefined && PROPOSING.has(last[1].ending))
    if (sentence && phrase.korean.endsWith("?") !== asks)
      faults.push({ kind: "mark", asks })
  }
  const main = closing?.kind === "closing" ? last?.[1] : undefined
  if (main !== undefined && ASKS.has(phrase.mood)) {
    // 바쁘세요 is not a request, and 먹었어요 tells no one to eat. 있다 asked
    // for (여기 있으세요) is refused with every existence stem: a limit.
    if (VOCABULARY[main.dictionary].class !== "verb")
      faults.push({ kind: "mood-stem" })
    if (main.tense !== "none") faults.push({ kind: "mood-tense" })
  }

  return [...faults, ...joiningFaults(readings, main, phrase.mood)]
}
