/**
 * Every word the preview page shows, in one place, so it stays in the
 * person's terms: what the subtitles look like and where they go, never the
 * machinery that draws them (`__tests__/words.test.ts`).
 */

import type { ThemeId } from "./theme"

const seconds = (ms: number): string => (Math.max(0, ms) / 1000).toFixed(1)

export const WORDS = {
  title: "Our own subtitles",
  intro:
    "How the words of each short look once they are part of the video. Pick a look, then play or drag through the sample lines.",
  sample:
    "The lines are a sample: a 49ers third-and-long. A real short's words, and when each one is said, come from its own voiceover.",
  lookHeading: "Look",
  looks: {
    gridiron: {
      name: "Gridiron",
      about:
        "Heavy capitals with a dark outline; each word pops in as it is said and lights up yellow.",
    },
    broadcast: {
      name: "Broadcast",
      about:
        "A whole line at once on a navy plate, like a game's lower third; the word being said turns blue.",
    },
    chalk: {
      name: "Chalk",
      about: "Soft white words that pop in one by one, with no colour change.",
    },
  } satisfies Record<ThemeId, { name: string; about: string }>,
  play: "Play",
  pause: "Pause",
  timeLabel: "Where in the sample",
  time: (atMs: number, totalMs: number): string =>
    `${seconds(atMs)} of ${seconds(totalMs)} seconds`,
  outline: "Show where YouTube draws over the video",
  outlineNote:
    "Inside the dashed box nothing of YouTube's covers the words: its buttons sit down the right and its title along the bottom.",
  fileHeading: "The plain subtitles that go up beside the short",
  fileNote:
    "YouTube shows these to anyone who turns captions on, and reads them for search. They carry the words and their times, without the look.",
  stageLabel: "The short, with its subtitles",
} as const
