/**
 * What feedback on an episode says (SFEED6, #2745): every word in one pure
 * table, in the person's terms, held by its test to no machinery. The
 * categories are decision 7's fixed set (#2670), as the owner wrote them.
 */
import { counted, formatTimecode } from "@some-ui/core-utils"

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
  cancel: "Not now",
  refused: {
    unwritable:
      "The phone couldn't keep this note. Your picks are still here; try again.",
    full: "The phone already keeps a thousand notes, and keeps no more until home keeps them. Your picks are still here.",
  },
  kept: "Note kept on this phone.",
  /** The episode page's count of its notes. */
  onThis: (n: number): string => `${counted(n, "note")} on this episode`,
  /** Where every note waits, on the Feedback page. */
  waiting:
    "Each note waits on this phone. Home doesn't keep notes yet, and nothing files them until it does.",
  goes: "Where it goes",
} as const
