/**
 * Every word the preview page shows, in one place, so it stays in the
 * person's terms: what each thing drawn into a video looks like and where it
 * goes, never the machinery that draws it (`__tests__/words.test.ts`).
 */

import type { Kind } from "./burn-in"
import type { ThemeId } from "./captions/theme"

const seconds = (ms: number): string => (Math.max(0, ms) / 1000).toFixed(1)

export const WORDS = {
  title: "What every video carries",
  intro:
    "The words and cards drawn into each video, the same way every time. Pick one and a look, then play or drag through the sample.",
  kindHeading: "What",
  kinds: {
    captions: {
      name: "Subtitles",
      about:
        "The words as they are said. The lines are a sample: a 49ers third-and-long. A real video's words, and when each one is said, come from its own voiceover.",
    },
    headline: {
      name: "Headline",
      about:
        "Above a recorded scene: what the scene is, and how the picture was recorded.",
    },
    card: {
      name: "Card",
      about:
        "A scene with no picture: a headline, then the point in large type and a note under it.",
    },
  } satisfies Record<Kind, { name: string; about: string }>,
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
    v1: {
      name: "Build Journal",
      about:
        "The look of every Build Journal short so far: pale words on slate, the kicker in teal.",
    },
  } satisfies Record<ThemeId | "v1", { name: string; about: string }>,
  play: "Play",
  pause: "Pause",
  timeLabel: "Where in the sample",
  time: (atMs: number, totalMs: number): string =>
    `${seconds(atMs)} of ${seconds(totalMs)} seconds`,
  outline: "Show where YouTube draws over the video",
  outlineNote:
    "Inside the dashed box nothing of YouTube's covers the words: its buttons sit down the right and its title along the bottom. The Build Journal headline sits above it, where the shorts so far have had it.",
  fileHeading: "The plain subtitles that go up beside the video",
  fileNote:
    "YouTube shows these to anyone who turns captions on, and reads them for search. They carry the words and their times, without the look.",
  stageLabel: "The video, with what is drawn into it",
} as const
