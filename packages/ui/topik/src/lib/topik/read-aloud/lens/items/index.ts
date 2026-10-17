/**
 * Grammar-lens items: which lines a lens set asks about, in what shape, and
 * what the step-down after a miss asks (adaptive-learning canon Def. 4.9,
 * Cor. 4.8, Rem. 4.15).
 *
 * Only a line with at least one authored misform yields items, and every
 * candidate is authored: nothing here makes a wrong form (Rem. 4.7). A set
 * mixes three shapes: picks, judges with a misform in place, and judges
 * shown as authored, of which there is always at least one (Cor. 4.8 (iii)).
 * Every draw - the lines, their shapes, the cue's modality, the order of
 * candidates and situations - comes from the set's seed, so it selects
 * nothing (Rem. 4.9) and a set can be rebuilt from its key.
 */

import { fnv1a, shuffledBySeed } from "@some-ui/core-utils"
import type {
  ReadAloudDeck,
  ReadAloudLevel,
  ReadAloudLine,
  Tense,
} from "@topik/lib/topik/read-aloud/content"
import { hangulRuns } from "@topik/lib/topik/read-aloud/glyphs"
import type { MistakeId } from "@topik/lib/topik/read-aloud/mistakes"

/** How the cue is given: read, heard, or both (Cor. 4.8). */
export type CueModality = "glyph" | "audio" | "both"

/** A piece of the response line: one of its written words, or what lies between. */
type LineSegment =
  | { kind: "word"; key: string; word: number; text: string }
  | { kind: "gap"; key: string; text: string }

/** What a pick offers for its open word: the word as written, or a misform. */
type LensCandidate = {
  /** The whole word this candidate puts in the line. */
  surface: string
  /** What its button shows: the word after the part every candidate shares. */
  label: string
  /** The catalogue entry it shows; absent for the word as written. */
  mistake?: MistakeId
  instead?: string
}

/** One question of the step-down, on a rung of a fixed ladder (Rem. 4.15). */
export type Probe =
  | { rung: 4; kind: "tense"; word: string; answer: Tense }
  | { rung: 3; kind: "subject" | "object"; answer: number }
  | {
      rung: 2
      kind: "split"
      word: string
      cuts: Array<number>
      answer: number
    }
  | { rung: 1; kind: "verb"; answer: number }

type LensShape =
  | {
      kind: "pick"
      word: number
      /** What the open word keeps whichever candidate fills it. */
      prefix: string
      candidates: Array<LensCandidate>
    }
  | {
      kind: "judge"
      /** The misform in place, or null for the line as authored. */
      misform: { word: number; surface: string; mistake: MistakeId } | null
    }

export type LensItem = {
  /** Stable within a deck and a set: `l:<lineId>`. */
  key: string
  lineId: string
  cue: {
    korean: string
    segments: Array<LineSegment>
    decides: Array<string>
    modality: CueModality
  } | null
  /** The response line as authored: the only form spoken or read aloud. */
  korean: string
  segments: Array<LineSegment>
  /** Its written words as authored, in order. */
  words: Array<string>
  /** Which of its words decide the misforms it shows, marked at the reveal. */
  decides: Array<number>
  shape: LensShape
  probes: Array<Probe>
  /** When someone would say it, in the order shown, and the author's pick. */
  situations: { options: Array<string>; intended: number } | null
}

/** What a learner answers: a pick's candidate, a judge's word, or "looks right". */
export type LensAnswer =
  | { kind: "pick"; candidate: number }
  | { kind: "word"; word: number }
  | { kind: "fine" }

export type LensSetOptions = {
  level: ReadAloudLevel
  seedKey: string
  size?: number
}

const DEFAULT_SIZE = 8

/**
 * How hard each mistake is to see, on the step-down's ladder: the step-down
 * after a miss asks only below it. Particles sit above the tense, the
 * conjugations above them, and aspect across a pair above all.
 */
const RUNG: Record<MistakeId, number> = {
  "e-for-eseo": 5,
  "eseo-for-e": 5,
  "eseo-after-time": 5,
  "object-for-subject": 5,
  "tense-mismatch": 4,
  "progressive-now": 7,
  "b-irregular": 6,
  "d-irregular": 6,
  "reu-irregular": 6,
  "eu-kept": 6,
  "vowel-harmony": 6,
  "honorific-self": 6,
}

const MAX_PROBES = 3

const PREDICATES = new Set(["action", "describing"])

/** The lines a lens set can ask about at `level`: those with a misform. */
export const lensLines = (
  deck: ReadAloudDeck,
  level: ReadAloudLevel
): Array<ReadAloudLine> =>
  deck.lines.filter((line) => line.level <= level && line.lens !== undefined)

/** The line's written words and what lies between them, in order. */
function segmentsOf(korean: string): Array<LineSegment> {
  let word = 0
  return hangulRuns(korean).map(({ text, hangul }, at) =>
    hangul
      ? { kind: "word" as const, key: `s${at}`, word: word++, text }
      : { kind: "gap" as const, key: `s${at}`, text }
  )
}

/** The longest start every surface shares and none consists of alone. */
function sharedPrefix(surfaces: ReadonlyArray<string>): string {
  const [first = ""] = surfaces
  let length = 0
  while (
    length < first.length &&
    surfaces.every((surface) => surface[length] === first[length])
  ) {
    length += 1
  }
  while (length > 0 && surfaces.some((surface) => surface.length <= length)) {
    length -= 1
  }
  return first.slice(0, length)
}

/** The words playing `roles`, by index. */
const wordsPlaying = (
  line: ReadAloudLine,
  roles: ReadonlySet<string>
): Array<number> =>
  line.words.flatMap((word, index) =>
    word.role !== undefined && roles.has(word.role) ? [index] : []
  )

/** The only word playing `roles`, or null when none or several do. */
function onlyWord(
  line: ReadAloudLine,
  roles: ReadonlySet<string>
): number | null {
  const found = wordsPlaying(line, roles)
  return found.length === 1 ? (found[0] ?? null) : null
}

/**
 * The word an item asks about: a pick's open word, or a judge's misformed
 * one; null for a judge shown as authored. Its written form is the
 * reveal's, so the step-down neither shows it nor asks about it (Rem. 4.15).
 */
export function askedWord({ shape }: LensItem): number | null {
  return shape.kind === "pick" ? shape.word : (shape.misform?.word ?? null)
}

/** Where a word may be cut around its stem's end: two or three choices. */
function splitCuts(syllables: number, stemEnd: number): Array<number> {
  return [stemEnd - 1, stemEnd, stemEnd + 1, stemEnd - 2]
    .filter((cut) => cut >= 1 && cut < syllables)
    .slice(0, 3)
    .sort((a, b) => a - b)
}

/**
 * The step-down for a line: below `rung`, highest first, each question asked
 * only where its answer is unique in the line (Rem. 4.15). None names or
 * answers with `asks` (`askedWord`).
 */
function probesFor(
  line: ReadAloudLine,
  rung: number,
  asks: number | null
): Array<Probe> {
  const probes: Array<Probe> = []
  if (line.tense !== undefined) {
    // Where the tense shows: the last predicate, else the last word.
    const at = wordsPlaying(line, PREDICATES).at(-1) ?? line.words.length - 1
    const word = line.words[at]?.surface
    if (word !== undefined && at !== asks) {
      probes.push({ rung: 4, kind: "tense", word, answer: line.tense })
    }
  }
  const object = onlyWord(line, new Set(["object"]))
  const subject = onlyWord(line, new Set(["subject"]))
  if (object !== null) {
    if (object !== asks) {
      probes.push({ rung: 3, kind: "object", answer: object })
    }
  } else if (subject !== null && subject !== asks) {
    probes.push({ rung: 3, kind: "subject", answer: subject })
  }
  // A word with no ending has no right cut, so it is never asked.
  const split = line.words.findIndex(
    ({ surface, stemEnd }, index) =>
      index !== asks &&
      stemEnd >= 1 &&
      stemEnd < surface.length &&
      splitCuts(surface.length, stemEnd).length >= 2
  )
  const splitWord = line.words[split]
  if (splitWord) {
    probes.push({
      rung: 2,
      kind: "split",
      word: splitWord.surface,
      cuts: splitCuts(splitWord.surface.length, splitWord.stemEnd),
      answer: splitWord.stemEnd,
    })
  }
  const verb = onlyWord(line, PREDICATES)
  if (verb !== null && verb !== asks) {
    probes.push({ rung: 1, kind: "verb", answer: verb })
  }
  return probes.filter((probe) => probe.rung < rung).slice(0, MAX_PROBES)
}

type ShapeKind = "pick" | "judge-misform" | "judge-authored"

/** Each set's shapes: about a quarter shown as authored, never none. */
function shapesFor(size: number, seed: number): Array<ShapeKind> {
  const authored = Math.max(1, Math.round(size / 4))
  const misformed = Math.min(size - authored, Math.round(size / 4))
  const shapes: Array<ShapeKind> = Array.from({ length: size }, (_, index) =>
    index < authored
      ? "judge-authored"
      : index < authored + misformed
        ? "judge-misform"
        : "pick"
  )
  return shuffledBySeed(shapes, seed)
}

function itemOf(
  line: ReadAloudLine,
  kind: ShapeKind,
  seedKey: string
): LensItem {
  const lens = line.lens
  const misforms = lens?.misforms ?? []
  const seed = (what: string): number =>
    fnv1a(`${seedKey}:lens:${line.id}:${what}`)
  const words = line.words.map((word) => word.surface)

  let shape: LensShape
  let asks: number | null = null
  let shown: Array<MistakeId>
  /** The misforms whose deciders the reveal marks. */
  let deciding: typeof misforms = []
  if (kind === "pick") {
    const misformed = [...new Set(misforms.map((m) => m.word))]
    const word = shuffledBySeed(misformed, seed("word"))[0] ?? 0
    const written = words[word] ?? ""
    const offered = misforms.filter((m) => m.word === word)
    const surfaces = [written, ...offered.map((m) => m.surface)]
    const prefix = sharedPrefix(surfaces)
    const candidates: Array<LensCandidate> = [
      { surface: written, label: written.slice(prefix.length) },
      ...offered.map(({ surface, mistake, instead }) => ({
        surface,
        label: surface.slice(prefix.length),
        mistake,
        ...(instead === undefined ? {} : { instead }),
      })),
    ]
    shape = {
      kind: "pick",
      word,
      prefix,
      candidates: shuffledBySeed(candidates, seed("candidates")),
    }
    asks = word
    shown = offered.map((m) => m.mistake)
    deciding = offered
  } else if (kind === "judge-misform") {
    const misform = shuffledBySeed(misforms, seed("misform"))[0]
    shape = {
      kind: "judge",
      misform: misform
        ? {
            word: misform.word,
            surface: misform.surface,
            mistake: misform.mistake,
          }
        : null,
    }
    asks = misform?.word ?? null
    shown = misform ? [misform.mistake] : []
    deciding = misform ? [misform] : []
  } else {
    shape = { kind: "judge", misform: null }
    shown = misforms.map((m) => m.mistake)
  }

  const rung = Math.max(...shown.map((mistake) => RUNG[mistake]))

  let cue: LensItem["cue"] = null
  if (lens?.cue) {
    const allowed: Array<CueModality> = lens.cue.hearable
      ? ["glyph", "audio", "both"]
      : ["glyph", "both"]
    const modality = shuffledBySeed(allowed, seed("cue"))[0] ?? "glyph"
    cue = {
      korean: lens.cue.korean,
      segments: segmentsOf(lens.cue.korean),
      decides: [...new Set(deciding.flatMap((m) => m.cueDecides))],
      modality,
    }
  }

  let situations: LensItem["situations"] = null
  if (lens?.situations) {
    const order = shuffledBySeed([0, 1, 2], seed("situations"))
    situations = {
      options: order.map((index) => lens.situations?.options[index] ?? ""),
      intended: order.indexOf(lens.situations.intended),
    }
  }

  return {
    key: `l:${line.id}`,
    lineId: line.id,
    cue,
    korean: line.korean,
    segments: segmentsOf(line.korean),
    words,
    decides: [...new Set(deciding.flatMap((m) => m.decides))],
    shape,
    probes: probesFor(line, rung, asks),
    situations,
  }
}

/**
 * Build one lens set from a deck: lines at the level first, then below it,
 * each drawn at most once, in an order drawn afresh. Empty when the deck has
 * no line with a misform at or below the level.
 */
export function buildLensSet(
  deck: ReadAloudDeck,
  { level, seedKey, size = DEFAULT_SIZE }: LensSetOptions
): Array<LensItem> {
  const eligible = lensLines(deck, level)
  const lines = [
    ...shuffledBySeed(
      eligible.filter((line) => line.level === level),
      fnv1a(`${seedKey}:lens:at`)
    ),
    ...shuffledBySeed(
      eligible.filter((line) => line.level < level),
      fnv1a(`${seedKey}:lens:below`)
    ),
  ].slice(0, Math.max(0, size))
  const shapes = shapesFor(lines.length, fnv1a(`${seedKey}:lens:shapes`))
  const items = lines.map((line, index) =>
    itemOf(line, shapes[index] ?? "pick", seedKey)
  )
  return shuffledBySeed(items, fnv1a(`${seedKey}:lens:order`))
}

/** The catalogue entries an item shows, each once; none for a judge as authored. */
export function shownMistakes(item: LensItem): Array<MistakeId> {
  const { shape } = item
  if (shape.kind === "judge")
    return shape.misform ? [shape.misform.mistake] : []
  return [
    ...new Set(shape.candidates.flatMap((c) => (c.mistake ? [c.mistake] : []))),
  ]
}

/** Whether an answer is right, and the catalogue entry it chose, if any. */
export function graded(
  item: LensItem,
  answer: LensAnswer
): { right: boolean; chosen: MistakeId | null } {
  const { shape } = item
  if (shape.kind === "pick") {
    const candidate =
      answer.kind === "pick" ? shape.candidates[answer.candidate] : undefined
    const mistake = candidate?.mistake ?? null
    return {
      right: candidate !== undefined && mistake === null,
      chosen: mistake,
    }
  }
  if (shape.misform === null) {
    return { right: answer.kind === "fine", chosen: null }
  }
  const right = answer.kind === "word" && answer.word === shape.misform.word
  return {
    right,
    chosen: answer.kind === "fine" ? shape.misform.mistake : null,
  }
}

/** Whether a step-down answer is right; a word's answer is its index. */
export function probeRight(probe: Probe, answer: string): boolean {
  return String(probe.answer) === answer
}
