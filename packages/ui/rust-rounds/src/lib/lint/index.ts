/**
 * The content lint: what makes a round that parses hard to play. It reports
 * findings and never refuses a round; the intake refuses only what the
 * schema does (`lib/intake`).
 *
 * - A line wider than `LINE_WIDTH_CAP`. Code on the phone never wraps, so
 *   the cap is what keeps sideways scrolling rare.
 * - A program longer than `PROGRAM_LINE_CAP` lines.
 * - A variant whose hunk does not apply: `of` names no earlier card with a
 *   program, `line` is past the program's end, or `replace` is the line
 *   already there.
 * - A choice with no `say`: the field is there, and blank.
 * - A refine card naming a note the log never saw.
 */
import type { HunkProblem, Round, RoundLog } from "@rust-rounds/lib/formats"
import { programLines, resolvePrograms } from "@rust-rounds/lib/formats"
import { assertNever } from "@some-ui/core-utils"

/**
 * Columns, counted in characters: about what a 360px-wide phone shows of a
 * monospace line beside the card's line gutter.
 */
export const LINE_WIDTH_CAP = 40

/** A toy binary is about 20 lines; past this it stops being one. */
export const PROGRAM_LINE_CAP = 25

export type Finding =
  | { kind: "line-too-wide"; card: string; line: number; width: number }
  | { kind: "program-too-long"; card: string; lines: number }
  | { kind: "hunk-does-not-apply"; card: string; why: HunkProblem }
  | { kind: "choice-without-say"; card: string; choice: number }
  | { kind: "unknown-note"; card: string; note: string }

const width = (line: string): number => [...line].length

/** Every voice note the log names: said on a card, or about a pasted error. */
function notesSeen(log: RoundLog): Set<string> {
  const seen = new Set<string>()
  for (const session of log.sessions) {
    for (const event of session.cards) {
      if (event.note !== null) seen.add(event.note)
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

  const wide = (card: string, lines: Array<string>, first: number): void => {
    lines.forEach((text, index) => {
      if (width(text) > LINE_WIDTH_CAP) {
        findings.push({
          kind: "line-too-wide",
          card,
          line: first + index,
          width: width(text),
        })
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
      wide(card.id, lines, 1)
      if (lines.length > PROGRAM_LINE_CAP) {
        findings.push({
          kind: "program-too-long",
          card: card.id,
          lines: lines.length,
        })
      }
    } else {
      // A variant changes one line; the rest were checked on the card it
      // changes, so only its new line is measured.
      wide(card.id, [card.hunk.replace], card.hunk.line)
      const problem = programs.get(card.id)?.problem ?? null
      if (problem !== null) {
        findings.push({
          kind: "hunk-does-not-apply",
          card: card.id,
          why: problem,
        })
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

const HUNK_PROBLEMS: Record<HunkProblem, string> = {
  "no-earlier-card":
    "`of` must name an earlier read or variant card in the round whose program applies.",
  "line-out-of-range": "`hunk.line` is past the end of the program it changes.",
  "changes-nothing":
    "`hunk.replace` is the line already there; the variant changes nothing.",
}

/** A finding as a line for the tutor: what is wrong, and what to do. */
export function describeFinding(finding: Finding): string {
  const card = `card "${finding.card}"`
  switch (finding.kind) {
    case "line-too-wide": {
      return `${card}, line ${finding.line}: ${finding.width} characters wide; keep every line to ${LINE_WIDTH_CAP}, since code on the phone never wraps.`
    }
    case "program-too-long": {
      return `${card}: the program is ${finding.lines} lines; keep it to ${PROGRAM_LINE_CAP} or fewer.`
    }
    case "hunk-does-not-apply": {
      return `${card}: ${HUNK_PROBLEMS[finding.why]}`
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
