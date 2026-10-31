/**
 * The content lint: what makes a round that parses hard to play on a phone.
 * It reports findings and never refuses; the intake refuses only what the
 * schemas do (`lib/intake`).
 */
import type { Round, RoundLog } from "@rust-rounds/lib/formats"
import { programLines, resolvePrograms } from "@rust-rounds/lib/formats"
import { assertNever } from "@some-ui/core-utils"

/**
 * Columns: about what a 360px-wide phone shows of a monospace line beside
 * the card's line gutter. Code on the phone never wraps, so the cap is what
 * keeps sideways scrolling rare.
 */
export const LINE_WIDTH_CAP = 40

/** A toy binary is about 20 lines; past this it stops being one. */
export const PROGRAM_LINE_CAP = 25

/** A tab's columns, as the card is expected to draw one; programs use spaces. */
const TAB_COLUMNS = 4

export type Finding =
  | { kind: "line-too-wide"; card: string; line: number; width: number }
  | { kind: "tab"; card: string; line: number }
  | { kind: "program-too-long"; card: string; lines: number }
  | { kind: "hunk-changes-nothing"; card: string }
  | { kind: "choice-without-say"; card: string; choice: number }
  | { kind: "unknown-note"; card: string; note: string }
  /** The reply carried no tutor notes (`lib/intake`). */
  | { kind: "no-tutor-notes" }

/**
 * Code points whose East Asian Width is Wide or Fullwidth (Unicode UAX #11),
 * by their main blocks: a monospace font draws each in two columns.
 */
const WIDE: ReadonlyArray<readonly [number, number]> = [
  [0x1100, 0x115f], // Hangul Jamo initials
  [0x2e80, 0x303e], // CJK radicals, punctuation
  [0x3041, 0x33ff], // kana, CJK compatibility
  [0x3400, 0x4dbf], // CJK extension A
  [0x4e00, 0x9fff], // CJK unified ideographs
  [0xa000, 0xa4cf], // Yi
  [0xa960, 0xa97f], // Hangul Jamo extended A
  [0xac00, 0xd7a3], // Hangul syllables
  [0xf900, 0xfaff], // CJK compatibility ideographs
  [0xfe10, 0xfe19], // vertical forms
  [0xfe30, 0xfe6f], // CJK compatibility forms, small forms
  [0xff00, 0xff60], // fullwidth forms
  [0xffe0, 0xffe6], // fullwidth signs
  [0x1f300, 0x1f64f], // pictographs, emoticons
  [0x1f900, 0x1f9ff], // supplemental pictographs
  [0x20000, 0x3fffd], // CJK extensions B and on
]

const EMOJI = /\p{Emoji_Presentation}|️/u

const graphemes = new Intl.Segmenter("en", { granularity: "grapheme" })

/** How many columns a grapheme cluster takes in a monospace font. */
function columnsOf(cluster: string): number {
  if (cluster === "\t") return TAB_COLUMNS
  const first = cluster.codePointAt(0) ?? 0
  const wide =
    EMOJI.test(cluster) ||
    WIDE.some(([from, to]) => first >= from && first <= to)
  return wide ? 2 : 1
}

/** A line's width in columns, counted by grapheme cluster. */
export function columns(line: string): number {
  let width = 0
  for (const { segment } of graphemes.segment(line)) {
    width += columnsOf(segment)
  }
  return width
}

/** Every voice note the log names: said on a card, refined, or about a pasted error. */
function notesSeen(log: RoundLog): Set<string> {
  const seen = new Set<string>()
  for (const session of log.sessions) {
    for (const event of session.cards) {
      if (event.note !== null) seen.add(event.note)
      if (event.refines !== null) seen.add(event.refines)
    }
    for (const paste of session.fromMyDesk) {
      if (paste.note !== null) seen.add(paste.note)
    }
  }
  return seen
}

/**
 * Every finding in `round`, in card order. `log` is everything the tutor was
 * given; pass a log with no sessions when there is none yet.
 */
export function lintRound(round: Round, log: RoundLog): Array<Finding> {
  const findings: Array<Finding> = []
  const programs = resolvePrograms(round)
  const seen = notesSeen(log)

  const measure = (card: string, lines: Array<string>, first: number): void => {
    lines.forEach((text, index) => {
      const line = first + index
      if (text.includes("\t")) findings.push({ kind: "tab", card, line })
      const width = columns(text)
      if (width > LINE_WIDTH_CAP) {
        findings.push({ kind: "line-too-wide", card, line, width })
      }
    })
  }

  for (const card of round.cards) {
    if (card.kind === "refine") {
      if (!seen.has(card.note)) {
        findings.push({ kind: "unknown-note", card: card.id, note: card.note })
      }
      continue
    }

    if (card.kind === "read") {
      const lines = programLines(card.program)
      measure(card.id, lines, 1)
      if (lines.length > PROGRAM_LINE_CAP) {
        findings.push({
          kind: "program-too-long",
          card: card.id,
          lines: lines.length,
        })
      }
    } else {
      // A variant changes one line; the rest were measured on the card it
      // changes.
      measure(card.id, [card.hunk.replace], card.hunk.line)
      const base = programLines(programs.get(card.of) ?? "")
      if (base[card.hunk.line - 1] === card.hunk.replace) {
        findings.push({ kind: "hunk-changes-nothing", card: card.id })
      }
    }

    card.choices.forEach((choice, index) => {
      if (choice.say.trim() === "") {
        findings.push({
          kind: "choice-without-say",
          card: card.id,
          choice: index + 1,
        })
      }
    })
  }
  return findings
}

/** A finding as a line for the tutor: what is wrong, and what to do. */
export function describeFinding(finding: Finding): string {
  if (finding.kind === "no-tutor-notes") {
    return "The reply carried no tutor notes: send them with every round, rewritten."
  }
  const card = `card "${finding.card}"`
  switch (finding.kind) {
    case "line-too-wide": {
      return `${card}, line ${finding.line}: ${finding.width} columns wide; keep every line to ${LINE_WIDTH_CAP}, since code on the phone never wraps.`
    }
    case "tab": {
      return `${card}, line ${finding.line}: indent with spaces, not a tab.`
    }
    case "program-too-long": {
      return `${card}: the program is ${finding.lines} lines; keep it to ${PROGRAM_LINE_CAP} or fewer.`
    }
    case "hunk-changes-nothing": {
      return `${card}: \`hunk.replace\` is the line already there; the variant changes nothing.`
    }
    case "choice-without-say": {
      return `${card}, choice ${finding.choice}: \`say\` is blank; every choice asks the owner to say something.`
    }
    case "unknown-note": {
      return `${card}: refines note "${finding.note}", which the log never names; refine only notes from the log.`
    }
    default: {
      return assertNever(finding)
    }
  }
}
