/**
 * Every word the preview page shows, in one place, so it stays in the
 * person's terms: what each thing drawn into a video looks like and where it
 * goes, never the machinery that draws it (`__tests__/words.test.ts`).
 */

import type { Actor } from "./authorship"
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
    authorship: {
      name: "Who made it",
      about:
        "Whose idea each scene is, and whose hands made it: a short key at the start, a small mark beside the picture as each scene plays, and every scene's record at the end. The sample is five scenes, one for each way an idea can come about.",
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
    "cells-v1": {
      name: "Cells",
      about:
        "One square for each of us, always in the same place. Filled for whose idea, half filled for whose words, outlined for whose hands.",
    },
  } satisfies Record<
    ThemeId | "v1" | "cells-v1",
    { name: string; about: string }
  >,
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
  /** What the authorship mark says inside the video. */
  authorship: {
    kicker: "WHO MADE THIS",
    introHeadline: "Each scene shows whose idea it is, and whose hands made it",
    endHeadline: "Who made each scene",
    actors: {
      you: { name: "Me", about: "My own thought, my own voice" },
      agent: { name: "Claude", about: "The AI agent I make these with" },
      code: { name: "Code", about: "My own code, the same every time it runs" },
      source: {
        name: "A source",
        about: "Someone else's work, named in the notes",
      },
    } satisfies Record<Actor, { name: string; about: string }>,
    grammar: {
      origin: "Filled: whose idea it is",
      wording: "Half filled: whose words say it",
      hand: "Outlined: whose hands made what you see",
    },
    grammarShort:
      "Filled: whose idea · half filled: whose words · outlined: whose hands",
    scene: (n: number): string => String(n),
    linkLabel: "Every scene, and how to read it:",
  },
  /** The page the end card links to. */
  record: {
    title: "Who made each scene",
    intro: [
      "I make these videos with Claude, an AI agent, and with code I wrote. Each one carries a small mark beside the picture that says, scene by scene, whose idea it is, whose words say it, and whose hands made what is on screen.",
      "The key below is the one each video opens with. The record beside it is the video's own, read from the link at its end, scene by scene in order.",
    ],
    keyHeading: "How to read the mark",
    keyLabel: "The key each video opens with",
    recordHeading: "This video's record",
    recordLabel: "The record of each scene, as the video's end card shows it",
    noRecord:
      "This link carries no record. The link at the end of a video names its scenes; open that one to see them here.",
  },
} as const
