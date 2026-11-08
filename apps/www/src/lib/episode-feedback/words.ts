/**
 * What feedback on an episode says (SFEED6, #2745): every word in one pure
 * table, in the person's terms, held by its test to no machinery. The
 * categories are decision 7's fixed set (#2670), as the owner wrote them.
 */
import { counted, dayWords, formatTimecode } from "@some-ui/core-utils"

import type { Category, Destination } from "./model"

export const CATEGORY_WORDS = {
  shallow: "Too shallow",
  technical: "Too technical",
  missedIntuition: "Missed my intuition",
  unsupported: "Wrong or unsupported",
  tooLong: "Too long",
  tooShort: "Too short",
  textClipped: "Text clipped",
  slideShakes: "A slide shakes",
  overlap: "Things overlap",
  hardToRead: "Hard to read",
  pacing: "Pacing",
  voice: "The voice",
  musicLoud: "Music too loud",
  subtitlesOff: "Subtitles off",
} as const satisfies Record<Category, string>

export const DESTINATION_WORDS = {
  nextFill: "Guides what the feed's next episode says",
  template: "Changes how the feed's episodes look and sound",
  defect: "A slide to fix",
} as const satisfies Record<Destination, string>

export const FEEDBACK_WORDS = {
  /** On an episode's page, under its video. */
  leave: "Leave a note here",
  at: (ms: number): string => `At ${formatTimecode(ms)}`,
  said: "What it said",
  shown: "How it looked or sounded",
  pick: "Pick what the note is about. Each goes where it belongs.",
  keep: "Keep the note",
  /** The note's spoken part, a take recorded with the note open. */
  say: "Say it, if you like",
  sayLine:
    "What you say is kept with your takes and goes home like them, even if you don't keep the note. The newest take goes with the note.",
  /** A kept note's row, when it has a spoken part. */
  spoken: "With what you said",
  cancel: "Not now",
  refused: {
    unwritable:
      "The phone couldn't keep this note. Your picks are still here; try again.",
    full: "The phone already keeps a thousand notes, so it can't keep another. Your picks are still here.",
  },
  keptHere: "Note kept on this phone.",
  /** The episode page's count of its notes. */
  onThis: (n: number): string => `${counted(n, "note")} on this episode`,
  /** Where every note is kept, on the Feedback page. */
  kept: "Every note stays on this phone, and each goes home on its own while the phone is paired.",
  /** One note's place, by what home last said of it. */
  onHome: (storedAt: string, today: string): string =>
    `On home since ${dayWords(storedAt, today)}`,
  /** Home read it back when it was sent; its list wasn't read just now. */
  onHomeSent: "On home",
  onPhone: "On this phone; it goes home on its own while paired",
  notTaken: "Home didn't take this note, so it stays on this phone",
  /** Why the page says nothing of home. */
  home: {
    unpaired: "This phone isn't paired with home, so the notes are only here.",
    older:
      "Home doesn't keep notes on episodes yet, so they wait on this phone.",
    away: "Home didn't answer, so this is what the phone knows of it.",
  },
  goes: "Where it goes",
} as const
