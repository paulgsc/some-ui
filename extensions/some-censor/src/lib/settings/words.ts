/**
 * Every word the popup, the settings page and the tab menu say about the
 * owner's choices (#1966), in one table, so they say the same thing and
 * `words.test.ts` can hold all of it to the person's terms: what each
 * choice shows, never the machinery behind it.
 */

import type { Autoplay, Mode } from "./settings"

/** The rows every mode card shows, in order. */
export const MODE_ROWS = [
  "Music shown whole",
  "Autoplay from music",
  "Original thumbnail",
  "Channel post images",
  "Cards still loading",
] as const

type ModeRow = (typeof MODE_ROWS)[number]

export type ModeWords = {
  readonly name: string
  /** One line: what the mode is for. */
  readonly tag: string
  readonly rows: Readonly<Record<ModeRow, string>>
}

export const MODE_WORDS: Readonly<Record<Mode, ModeWords>> = {
  strict: {
    name: "Strict",
    tag: "Only artist music gets through, and nothing opens on demand.",
    rows: {
      "Music shown whole": "From artist channels",
      "Autoplay from music": "Music only",
      "Original thumbnail": "Never shown",
      "Channel post images": "Hidden",
      "Cards still loading": "Blank",
    },
  },
  standard: {
    name: "Standard",
    tag: "Music by title or channel. One way to see a thumbnail: hold.",
    rows: {
      "Music shown whole": "From artist channels, or OST and MV titles",
      "Autoplay from music": "Anything shown",
      "Original thumbnail": "After a 3-second hold",
      "Channel post images": "Hidden",
      "Cards still loading": "Blurred",
    },
  },
  open: {
    name: "Open",
    tag: "As Standard, with post images and a quicker thumbnail.",
    rows: {
      "Music shown whole": "From artist channels, or OST and MV titles",
      "Autoplay from music": "Anything shown",
      "Original thumbnail": "At 3 seconds, and can be hidden again",
      "Channel post images": "Shown",
      "Cards still loading": "Blurred",
    },
  },
}

/** What every mode keeps, said once under the cards. */
export const EVERY_MODE = [
  "Recent videos are left off the page.",
  "Older ones show without their thumbnails.",
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

export const MODE_QUESTION = "Mode"

/** The popup's and the settings page's own words. */
export const PAGE_WORDS = {
  on: "On",
  off: "Off: plain YouTube",
  current: "Current",
  default: "Default",
  scale: "more held → more shown",
  everyMode: "In every mode",
  ageNote: "Applies in every mode.",
  follows: "Every open YouTube tab follows as you choose.",
  allSettings: "All settings",
  diagnostics: "Diagnostics",
} as const

/** The tab and toolbar-button menu (`background.ts`). */
export const MENU_WORDS = {
  on: PAGE_WORDS.on,
  mode: MODE_QUESTION,
  autoplayStops: "Autoplay stops at held videos",
  settings: `${PAGE_WORDS.allSettings}…`,
} as const
