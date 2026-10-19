/**
 * Every word the popup, the settings page and the tab menu say about the
 * owner's choices (#1966), in one table, so they say the same thing and
 * `words.test.ts` can hold all of it to the person's terms: what each
 * choice shows, never the machinery behind it.
 */

import type { Autoplay, Mode } from "./settings"

export type ModeWords = {
  readonly name: string
  /** One line: what the mode is for. */
  readonly tag: string
  /** One value per {@link MODE_ROWS} row, in order. */
  readonly rows: ReadonlyArray<string>
}

/** The rows every mode card shows, in the order of `ModeWords.rows`. */
export const MODE_ROWS = [
  "Music shown whole",
  "Autoplay from music",
  "Original thumbnail",
  "Channel post images",
  "Cards still loading",
] as const

export const MODE_WORDS: Readonly<Record<Mode, ModeWords>> = {
  strict: {
    name: "Strict",
    tag: "Only artist music gets through, and nothing opens on demand.",
    rows: [
      "From artist channels",
      "Music only",
      "Never shown",
      "Hidden",
      "Blank",
    ],
  },
  standard: {
    name: "Standard",
    tag: "Music by title or channel. One way to see a thumbnail: hold.",
    rows: [
      "From artist channels, or OST and MV titles",
      "Anything shown",
      "After a 3-second hold",
      "Hidden",
      "Blurred",
    ],
  },
  open: {
    name: "Open",
    tag: "As Standard, with post images and a quicker thumbnail.",
    rows: [
      "From artist channels, or OST and MV titles",
      "Anything shown",
      "At 3 seconds, and can be hidden again",
      "Shown",
      "Blurred",
    ],
  },
}

/** What every mode keeps, said once under the cards. */
export const EVERY_MODE = [
  "Recent videos are left off the page.",
  "Older ones are plated.",
  "No views, likes, comments or ages.",
] as const

export const AUTOPLAY_QUESTION = "When autoplay reaches a held video"

export const AUTOPLAY_WORDS: Readonly<
  Record<Autoplay, { readonly label: string; readonly line: string }>
> = {
  stop: {
    label: "Stop",
    line: "The video ends and the page stays where it is.",
  },
  skip: {
    label: "Skip it",
    line: "It plays the next video in Up next that isn't held.",
  },
}

export const AGE_QUESTION = "Show videos older than"

/** The tab and toolbar-button menu (`background.ts`). */
export const MENU_WORDS = {
  on: "On",
  mode: "Mode",
  autoplayStops: "Autoplay stops at held videos",
  settings: "All settings…",
} as const
