/**
 * A spoken card in Studio (W5, C805): pure. A spoken card is pasted on this phone and
 * kept here (C806). It has a category, which maps to the template an essay
 * renders it with (`SPOKEN_CATEGORIES`): an `introduction` opens its
 * essay, and a `questions` card sits anywhere in it; each speaker is lit
 * while they speak. It is split into parts: a
 * part to read on the teleprompter, or one to say in your own words. A part
 * may carry an id and the question Kokoro asks before it, as Rust Rounds' opening does
 * (`Exchange { ask, script }` in `@some-ui/video-render`'s `opening.ts`).
 *
 * Each take of a part is an ordinary Studio take on home (C807), named by
 * its line `spoken:<card>.<part>` (soundbites' `spokenLineOf`): two parts split on `:`, so home keeps it
 * as a take with no scene (paulgsc/server `voice/src/about.rs`, `studio`), and
 * never reads it as a scene's (three parts) or an idea's answer (`idea:`).
 * The card keeps the id of every take each part has had, append-only: a
 * take said again is one more, and none is ever dropped (C783). Which take a
 * part uses is the owner's pick, and only a pick. An essay reads the takes on
 * home by id; nothing is cut by hand (C808).
 *
 * - **SCR1:** a part's takes only grow (`withSeen`).
 * - **SCR2:** a part's kind changes only while it has no take (`flip`).
 * - **SCR3:** a part uses only one of its own takes, and none home heard
 *   nothing in (`use`, `unuse`).
 */
import type { SpokenCategory } from "@some-ui/video-render"
import { isSpokenCategory, spokenLineOf } from "@some-ui/video-render"

/** How a part is said: read on the band, or in your own words. */
export type PartKind = "read" | "own"

export type SpokenPart = {
  /** The id its paste gave it (`SCRIPT intro-who`); null for none. */
  readonly id: string | null
  readonly kind: PartKind
  /** What Kokoro asks before it in an essay; null for none. */
  readonly ask: string | null
  /** The words to read, or the prompt to answer in your own words. */
  readonly text: string
  /** Every take of the part, by id, oldest first (SCR1). */
  readonly takes: ReadonlyArray<string>
  /** The take the part uses in an essay; null until one is picked. */
  readonly using: string | null
}

export type SpokenCard = {
  /** Made on this phone when it was pasted: letters, digits and `-`. */
  readonly id: string
  readonly title: string
  readonly category: SpokenCategory
  /** When it was pasted, as an ISO time. */
  readonly pastedAt: string
  readonly parts: ReadonlyArray<SpokenPart>
}

/** A spoken card as pasted, before it is kept. */
export type PastedCard = {
  readonly title: string
  readonly category: SpokenCategory
  readonly parts: ReadonlyArray<Omit<SpokenPart, "takes" | "using">>
}

/** The longest card a paste keeps, in parts; `keptCard` drops the rest. */
export const PARTS_MOST = 40

const MARK = /^\s*(SCRIPT|OWN WORDS|QUESTION)(?=\s|:|$)\s*:?\s*(.*)$/u
const CATEGORY = /^\s*CATEGORY\s*:?\s*(\S*)\s*$/u

/**
 * `text` as a spoken card, or null when it holds nothing to say or names a
 * category Studio doesn't know. A line `CATEGORY <name>` names its category
 * (`introduction` when none does). The first other line is its title when a
 * part follows it. A line `SCRIPT` starts a part to read, `OWN WORDS` one to
 * say in your own words, either with one word after it as the part's id
 * (`SCRIPT intro-who`), and `QUESTION <words>` inside a part is what Kokoro
 * asks before it. With no such lines, each paragraph is a part to read.
 */
export function parseCard(text: string): PastedCard | null {
  const all = text.replace(/\r\n?/gu, "\n").split("\n")
  const named = all
    .map((line) => CATEGORY.exec(line))
    .find((match) => match !== null)
  const category = named?.[1].toLowerCase() ?? "introduction"
  if (!isSpokenCategory(category)) return null
  const lines = all.filter((line) => !CATEGORY.test(line))
  const marked = lines.some((line) => {
    const mark = MARK.exec(line)
    return mark !== null && mark[1] !== "QUESTION"
  })
  const card = marked ? parseMarked(lines) : parseParagraphs(lines)
  return card === null ? null : { ...card, category }
}

type Draft = {
  id: string | null
  kind: PartKind
  ask: string | null
  text: Array<string>
}

/** A part's id after its keyword: one word of lowercase letters, digits and `-`. */
const PART_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u

const finish = (
  draft: Draft | null
): Omit<SpokenPart, "takes" | "using"> | null => {
  if (draft === null) return null
  const said = draft.text.join("\n").trim()
  return said === ""
    ? null
    : { id: draft.id, kind: draft.kind, ask: draft.ask, text: said }
}

function parseMarked(
  lines: ReadonlyArray<string>
): Omit<PastedCard, "category"> | null {
  const before: Array<string> = []
  const parts: Array<Omit<SpokenPart, "takes" | "using">> = []
  let draft: Draft | null = null
  for (const line of lines) {
    const mark = MARK.exec(line)
    if (mark?.[1] === "SCRIPT" || mark?.[1] === "OWN WORDS") {
      const done = finish(draft)
      if (done !== null) parts.push(done)
      // One word after the keyword is the part's id; more is its first words.
      const rest = mark[2].trim()
      const named = PART_ID.test(rest)
      draft = {
        id: named ? rest : null,
        kind: mark[1] === "SCRIPT" ? "read" : "own",
        ask: null,
        text: named || rest === "" ? [] : [rest],
      }
      continue
    }
    if (mark?.[1] === "QUESTION" && draft !== null) {
      const ask = mark[2].trim()
      draft.ask = ask === "" ? null : ask
      continue
    }
    if (draft === null) before.push(line)
    else draft.text.push(line)
  }
  const done = finish(draft)
  if (done !== null) parts.push(done)
  if (parts.length === 0) return null
  const title = before.map((line) => line.trim()).find((line) => line !== "")
  return { title: title ?? "", parts }
}

function parseParagraphs(
  lines: ReadonlyArray<string>
): Omit<PastedCard, "category"> | null {
  const paragraphs = lines
    .join("\n")
    .split(/\n\s*\n/u)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== "")
  if (paragraphs.length === 0) return null
  // A short first line on its own is the title, when a part follows it.
  const [first, ...rest] = paragraphs
  const titled =
    rest.length > 0 && !first.includes("\n")
      ? { title: first, parts: rest }
      : { title: "", parts: paragraphs }
  return {
    title: titled.title,
    parts: titled.parts.map((text) => ({
      id: null,
      kind: "read" as const,
      ask: null,
      text,
    })),
  }
}

/** Kept as a script with id `id`, pasted at `at`, its parts with no takes. */
export const keptCard = (
  pasted: PastedCard,
  id: string,
  at: string
): SpokenCard => ({
  id,
  title: pasted.title,
  category: pasted.category,
  pastedAt: at,
  parts: pasted.parts
    .slice(0, PARTS_MOST)
    .map((part) => ({ ...part, takes: [], using: null })),
})

/** A new script's id from its paste time and a few random letters. */
export const cardId = (at: number, random: () => number): string =>
  `sc${at.toString(36)}${Math.floor(random() * 36 ** 4)
    .toString(36)
    .padStart(4, "0")}`

/**
 * `script` having seen `takes` on this phone, each with the line it answers:
 * every take of one of its parts that the part doesn't list yet is added,
 * oldest first (SCR1). The same script when nothing is new.
 */
export function withSeen(
  script: SpokenCard,
  takes: ReadonlyArray<{ readonly id: string; readonly line: string }>
): SpokenCard {
  const parts = script.parts.map((part, n) => {
    const line = spokenLineOf(script.id, n)
    const added = takes
      .filter((take) => take.line === line && !part.takes.includes(take.id))
      .map((take) => take.id)
    return added.length === 0
      ? part
      : { ...part, takes: [...part.takes, ...added] }
  })
  return parts.some((part, n) => part !== script.parts.at(n))
    ? { ...script, parts }
    : script
}

/** Part `n` of `card`, from 0; undefined for a place it doesn't have. */
export const partAt = (card: SpokenCard, n: number): SpokenPart | undefined =>
  Number.isInteger(n) && n >= 0 ? card.parts.at(n) : undefined

/** `script` with part `n` said the other way; the same while it has a take (SCR2). */
export function flip(script: SpokenCard, n: number): SpokenCard {
  const part = partAt(script, n)
  if (part === undefined || part.takes.length > 0) return script
  return replacePart(script, n, {
    ...part,
    kind: part.kind === "read" ? "own" : "read",
  })
}

/** `script` with part `n` using take `take`; the same if the part never had it (SCR3). */
export function use(script: SpokenCard, n: number, take: string): SpokenCard {
  const part = partAt(script, n)
  if (!part?.takes.includes(take)) return script
  if (part.using === take) return script
  return replacePart(script, n, { ...part, using: take })
}

/**
 * `script` with no part using `take`: home heard nothing in it, so an essay
 * can't use it (SCR3). The take stays the part's.
 */
export function unuse(script: SpokenCard, take: string): SpokenCard {
  if (!script.parts.some((part) => part.using === take)) return script
  return {
    ...script,
    parts: script.parts.map((part) =>
      part.using === take ? { ...part, using: null } : part
    ),
  }
}

const replacePart = (
  script: SpokenCard,
  n: number,
  part: SpokenPart
): SpokenCard => ({
  ...script,
  parts: script.parts.map((each, at) => (at === n ? part : each)),
})
