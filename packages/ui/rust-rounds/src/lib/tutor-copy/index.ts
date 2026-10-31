/**
 * "Copy for a tutor": the log as markdown, for any chat to answer with the
 * next round. Pasted into a chat with no other context, it is enough: it
 * carries the tutor's instructions and the formats (`ROUTINE.md`), one
 * worked example, the tutor notes so far, and the log with every voice
 * note's transcript inline. It names notes by id and never holds audio.
 *
 * The instructions and the example are not written here, so neither can
 * drift: `ROUTINE.md` is the routine's own text, and the example is the one
 * the schemas are tested against (`lib/worked-example`).
 */
import ROUTINE from "@rust-rounds-root/ROUTINE.md?raw"
import type {
  CardEvent,
  CardRef,
  Round,
  RoundLog,
  RustcRun,
  Session,
  TutorNotes,
} from "@rust-rounds/lib/formats"
import { expectMatches, resolvePrograms } from "@rust-rounds/lib/formats"
import { INDEXING_01, INDEXING_01_NOTES } from "@rust-rounds/lib/worked-example"
import { assertNever } from "@some-ui/core-utils"

export type TutorCopyInput = {
  log: RoundLog
  /** The rounds the log's cards come from; a card from one not here is shown by id. */
  rounds: ReadonlyArray<Round>
  /** The tutor notes written with the last round; null before the first. */
  notes: TutorNotes | null
  /** What home transcribed, by note id. */
  transcripts: ReadonlyMap<string, string>
}

const ABOUT = [
  "Exported from Rust Rounds on the owner's phone, for a tutor writing the next round.",
  "Rust Rounds shows the owner small Rust programs and what rustc really did with them. The owner answers by voice, and nothing is graded.",
  "Below are the tutor's instructions with the file formats, a worked example, the tutor notes so far, and the log, with each voice note's transcript inline.",
  "Reply with the next round and the rewritten tutor notes, as the instructions say.",
]

/** A fence longer than any run of backticks in `text`, so nothing in it closes the block. */
function fenced(text: string, language: string): string {
  const longest = Math.max(
    0,
    ...[...text.matchAll(/`+/g)].map((run) => run[0].length)
  )
  const fence = "`".repeat(Math.max(3, longest + 1))
  return [fence + language, text.replace(/\n$/, ""), fence].join("\n")
}

/** Markdown with every heading one level deeper, fenced lines left alone. */
function nested(markdown: string): string {
  let inFence = false
  return markdown
    .split("\n")
    .map((line) => {
      if (line.startsWith("```")) inFence = !inFence
      return !inFence && /^#+ /.test(line) ? `#${line}` : line
    })
    .join("\n")
}

const json = (value: unknown): string =>
  fenced(JSON.stringify(value, null, 2), "json")

const said = (
  note: string,
  transcripts: ReadonlyMap<string, string>
): string => {
  const transcript = transcripts.get(note)
  return transcript === undefined
    ? `\`${note}\` (not transcribed yet)`
    : `\`${note}\`: "${transcript}"`
}

function runLines(run: RustcRun | null): Array<string> {
  if (run === null) return ["- rustc: no recorded run was held for this card."]
  const head = `- rustc ${run.toolchain}:`
  switch (run.outcome) {
    case "compile-error": {
      return [
        `${head} does not compile (${run.code ?? "no error code"}).`,
        "",
        fenced(run.stderr, "text"),
        "",
      ]
    }
    case "prints": {
      return [`${head} prints:`, "", fenced(run.stdout, "text"), ""]
    }
    case "panics": {
      return [
        `${head} panics.`,
        "",
        fenced(run.stdout + run.stderr, "text"),
        "",
      ]
    }
    case "stopped": {
      return [
        `${head} the sandbox stopped it (${run.why}).`,
        "",
        fenced(run.stdout + run.stderr, "text"),
        "",
      ]
    }
    default: {
      return assertNever(run)
    }
  }
}

function eventLines(
  event: CardEvent,
  rounds: ReadonlyMap<string, Round>,
  transcripts: ReadonlyMap<string, string>
): Array<string> {
  const round = rounds.get(event.round)
  const card = round?.cards.find((each) => each.id === event.card)
  const title = `#### ${event.round}, card ${event.card}`
  if (round === undefined || card === undefined) {
    return [title, "", `- At ${event.at}. The card is not on this phone.`, ""]
  }
  const lines = [`${title} (${card.kind})`, "", `- At ${event.at}.`]

  if (card.kind === "refine") {
    lines.push(
      `- Refines ${said(card.note, transcripts)}`,
      `- Nudge: "${card.nudge}" Aim: ${card.aim}. Asked to say: "${card.say}"`
    )
  } else {
    const program = resolvePrograms(round).get(card.id)?.program ?? null
    if (card.kind === "variant") {
      lines.push(
        `- Card ${card.of} with line ${card.hunk.line} changed to \`${card.hunk.replace}\`.`
      )
    }
    lines.push("", fenced(program ?? "(the hunk does not apply)", "rust"), "")
    lines.push(
      `- Asked: "${card.ask}" Choices: ${card.choices.map((choice) => `"${choice.pick}"`).join(", ")}.`,
      event.picked === null
        ? "- Picked nothing."
        : `- Picked "${event.picked}".`
    )
  }

  lines.push(
    event.note === null
      ? "- Said nothing."
      : `- Said ${said(event.note, transcripts)}`
  )
  if (event.skipped) lines.push("- Moved on before rustc's result was shown.")
  lines.push(...runLines(event.rustc))
  if (card.kind !== "refine" && event.rustc !== null) {
    lines.push(
      `- Your guess (${card.expect.outcome}) ${expectMatches(card.expect, event.rustc) ? "matched" : "differed from"} what rustc did.`
    )
  }
  lines.push("")
  return lines
}

const refs = (cards: ReadonlyArray<CardRef>): string =>
  cards.length === 0
    ? "none"
    : cards.map((ref) => `${ref.round} card ${ref.card}`).join(", ")

function sessionLines(
  session: Session,
  rounds: ReadonlyMap<string, Round>,
  transcripts: ReadonlyMap<string, string>
): Array<string> {
  const lines = [`### Session ${session.id}, opened ${session.startedAt}`, ""]
  for (const event of session.cards) {
    lines.push(...eventLines(event, rounds, transcripts))
  }
  for (const paste of session.fromMyDesk) {
    lines.push(
      `#### From the owner's desk, at ${paste.at}`,
      "",
      "An error from the owner's own code:",
      "",
      fenced(paste.pasted, "text"),
      "",
      paste.note === null
        ? "- Said nothing about it."
        : `- Said ${said(paste.note, transcripts)}`,
      ""
    )
  }
  lines.push(
    `- Pinned: ${refs(session.pinned)}.`,
    `- Your guesses rustc disagreed with: ${refs(session.tutorGuessedWrong)}.`,
    ""
  )
  return lines
}

/** The whole copy, ready for the share sheet or the clipboard. */
export function copyForTutor(input: TutorCopyInput): string {
  const rounds = new Map(input.rounds.map((round) => [round.id, round]))
  const lines = [
    "# Rust Rounds: the log, for a tutor",
    "",
    ...ABOUT,
    "",
    nested(ROUTINE.trimEnd()),
    "",
    "## The worked example",
    "",
    "The owner's first round, and the tutor notes written with it. Match the shape; write your own programs and edges.",
    "",
    json(INDEXING_01),
    "",
    json(INDEXING_01_NOTES),
    "",
    "## The tutor notes so far",
    "",
    input.notes === null
      ? "None yet: start them with your round."
      : json(input.notes),
    "",
    "## The log",
    "",
  ]
  if (input.log.sessions.length === 0) lines.push("Nothing played yet.", "")
  for (const session of input.log.sessions) {
    lines.push(...sessionLines(session, rounds, input.transcripts))
  }
  return `${lines.join("\n").trimEnd()}\n`
}
