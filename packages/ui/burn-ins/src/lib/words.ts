/**
 * Every word the preview page shows, in one place, so it stays in the
 * person's terms: what each thing drawn into a video looks like and where it
 * goes, never the machinery that draws it (`__tests__/words.test.ts`).
 */

import type { Actor } from "./authorship"
import type { Kind } from "./burn-in"
import type { ThemeId } from "./captions/theme"
import type { GameCardTemplate, Quarter } from "./game-card"

const seconds = (ms: number): string => (Math.max(0, ms) / 1000).toFixed(1)

/** "1st", "2nd", "3rd", "4th", "11th", "22nd". */
export function ordinal(n: number): string {
  const tens = n % 100
  if (tens >= 11 && tens <= 13) return `${n}th`
  const suffix = ["th", "st", "nd", "rd"][n % 10] ?? "th"
  return `${n}${suffix}`
}

const quarterName = (q: Quarter): string =>
  q === "OT" ? "Overtime" : `${ordinal(q)} quarter`

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
    "game-card": {
      name: "Game card",
      about:
        "A card over a game-week short's picture, under the headline and above the subtitles: the situation, the score, a scenario, a chain of outcomes, or the ways into the playoffs. Teams are named by their codes, as text.",
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
    "gridiron-v1": {
      name: "Game day",
      about:
        "White on a deep navy plate with a yellow stripe down its left edge; the line above, a scenario's icon and the leader's points in yellow.",
    },
  } satisfies Record<
    ThemeId | "v1" | "cells-v1" | "gridiron-v1",
    { name: string; about: string }
  >,
  templateHeading: "Which card",
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
  /** What the game cards say inside the video, and each one's name. */
  gameCard: {
    templates: {
      stat: {
        name: "Situation",
        about:
          "The down, the distance, the margin and the time left, for one team. The sample is a 49ers third-and-8, down 4 late in the fourth.",
      },
      score: {
        name: "Score",
        about:
          "The score at that moment, the visitors over the home team, the leader's points in yellow.",
      },
      scenario: {
        name: "Scenario",
        about:
          "One of the fixed game-week scenarios: its icon and its name as the catalog has them, and how it came out, when that is known.",
      },
      chain: {
        name: "Chain",
        about:
          "Two to four outcomes, one leading to the next: each a scenario and how it came out, or a few plain words.",
      },
      path: {
        name: "Ways in",
        about:
          "From Playoff Delta's week: how many more wins get the team in, and the best seed each can reach.",
      },
    } satisfies Record<GameCardTemplate, { name: string; about: string }>,
    quarter: quarterName,
    downAndDistance: (down: number, toGo: number | "goal"): string =>
      `${ordinal(down)} and ${toGo}`,
    margin: (points: number): string =>
      points === 0
        ? "Tied"
        : points > 0
          ? `Up ${points}`
          : `Down ${Math.abs(points)}`,
    left: (clock: string): string => `${clock} left`,
    halftime: "Halftime",
    final: "Final",
    pathKicker: (week: number): string => `Playoff Delta · week ${week}`,
    pathHeadline: (team: string): string => `How ${team} gets in`,
    wins: (more: number): string =>
      more === 0 ? "Lose out" : `Win ${more} more`,
    seed: (seed: number): string => `as high as the ${ordinal(seed)} seed`,
    noWayIn: "No way in is left",
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
    tooLong:
      "This link names more scenes than a video's record holds, so it isn't one a video printed. Check it against the end of the video.",
  },
} as const
