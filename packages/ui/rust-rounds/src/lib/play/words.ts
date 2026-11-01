/**
 * Every word Rust Rounds puts on the screen, in one pure table, so a test can
 * hold them to the owner's rules (#2231, #2235): no score, verdict, "you
 * said", level or streak, nothing that counts the time or says "done", and
 * no status code or internal name. rustc's own output is shown as printed, beside these words,
 * never in them; the pick is never set against it.
 *
 * A voice note's own words are the take pattern's (`@some-ui/voice-capture`'s
 * `TAKE_WORDS`), said by its parts: the take button, its line and
 * the note's row. They include the one time on screen, a take's elapsed time
 * against its cap and its length (the owner, 2026-10-31, epic #2368); none of
 * these words counts time.
 */
import type { BLOOM_STEPS, RustcRun } from "@rust-rounds/lib/formats"
import { assertNever } from "@some-ui/core-utils"

import type { Title } from "./store"

type Aim = (typeof BLOOM_STEPS)[number]

export const WORDS = {
  title: "Rust Rounds",
  /** The Practice Home card's line, before any card has been played. */
  entryFresh: "Small Rust programs, and what rustc really did with them",
  continueAt: (concept: string, number: number): string =>
    `Continue: ${concept}, card ${number}`,
  start: "Start",
  menuHeading: "Pick a concept",
  mixed: "Mixed",
  newFromTutor: (concept: string, cards: number): string =>
    `New from the tutor: ${concept}, ${cards === 1 ? "1 card" : `${cards} cards`}`,
  refinesWaiting: (count: number): string =>
    count === 1 ? "1 note to say again" : `${count} notes to say again`,
  tutor: "Tutor",
  menu: "Menu",
  next: "Next",
  pin: "Pin",
  pinned: "Pinned",
  cardTitle: (concept: string, number: number): string =>
    `${concept} · card ${number}`,
  program: "The program",
  oneLineChanged: (line: number): string => `Line ${line} changed`,
  skipToRustc: "Skip, show me rustc",
  /** Skip on a card with no run of its program on the phone. */
  skip: "Skip",
  /** The card came up again, in a later turn. */
  playedBefore: "You've had this card before.",
  /** Next found no other card in this concept. */
  onlyCard: "The only card in this concept, again.",
  sayThis: "Say it",
  /** What the card on screen says of its voice note. */
  voiceNote: "Your note",
  /** A take an earlier opening left here, of which the phone holds no note. */
  noteMissing: "The note you started here wasn't kept. Tap to say it again.",
  /** A card left before its note was kept, and the note was lost. */
  noteLost: (concept: string, number: number): string =>
    `The note on ${concept}, card ${number} couldn't be kept.`,
  /** The phone's room for voice notes is used up; on the menu and the speak step. */
  noRoom:
    "This phone has no room left for voice notes. Sending them home comes next; until then, every card still plays.",
  earlierNote: "Your earlier note",
  earlierNoteMissing:
    "Your earlier note isn't on this phone yet. Say it again anyway.",
  fromTutor: "From the tutor",
  aim: {
    remember: "Recall it",
    understand: "Explain it",
    apply: "Use it",
    analyze: "Take it apart",
    evaluate: "Weigh it",
    create: "Make your own",
  } satisfies Readonly<Record<Aim, string>>,
  rustcVersion: (toolchain: string): string => `rustc ${toolchain}`,
  rustcPrinted: "What rustc printed",
  noRun: "No run of this program is on this phone yet.",
  compiling: "rustc printed while compiling",
  printed: "It printed",
  printedNothing: "It printed nothing.",
  errorOutput: "It printed to its error output",
  notKept: "This phone couldn't save what you did last. It's still on screen.",
  copyForTutor: "Copy for a tutor",
  copying: "Copying…",
  copied: "Copied. Paste it into any chat, then paste the reply below.",
  copyFailed: "Couldn't copy. Select the text below instead.",
  replyLabel: "The tutor's reply",
  takeReply: "Take it",
  replyEmpty: "Paste the tutor's whole reply first.",
  replyTaken: (concept: string, cards: number): string =>
    `Taken: ${cards === 1 ? "1 new card" : `${cards} new cards`} in ${concept}.`,
  replyAlreadyHere: "That round is already on this phone.",
  replyRefused: "That reply couldn't be taken. Send the tutor what to fix.",
  copyFix: "Copy what to fix",
  fixCopied: "Copied. Paste it back to the tutor.",
  showText: "Show the text",
  backToCards: "Back to the cards",
} as const

/** What rustc did with the program, said plainly; its output follows as printed. */
export function runHeading(run: RustcRun): string {
  switch (run.outcome) {
    case "compile-error": {
      return "rustc didn't compile it"
    }
    case "prints": {
      return "It compiled and ran"
    }
    case "panics": {
      return "It compiled, ran and panicked"
    }
    case "stopped": {
      return STOPPED[run.why]
    }
    default: {
      return assertNever(run)
    }
  }
}

const STOPPED: Readonly<
  Record<Extract<RustcRun, { outcome: "stopped" }>["why"], string>
> = {
  time: "It compiled, ran on and on, and the sandbox ended it",
  memory: "It compiled, used too much memory, and the sandbox ended it",
  output: "It compiled, printed too much, and the sandbox ended it",
  exit: "It compiled, ran and exited with a failure",
}

/** What the Practice Home card says: where to come back to, or what this is. */
export function entryLine(title: Title | null): string {
  return title === null
    ? WORDS.entryFresh
    : WORDS.continueAt(title.concept, title.number)
}
