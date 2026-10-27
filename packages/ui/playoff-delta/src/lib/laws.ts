/**
 * The algebra the stage teaches, one law at a time: each episode states the
 * law its week's biggest league result shows, the rule behind why that light
 * went the way it did. The words for every law live here, so the slide and
 * the voiceover read the same lines.
 */

import { leagueResults, type StoryWeek } from "./story"

export type LawKey = "conservation" | "kinds" | "room"

type Law = {
  readonly name: string
  /** The law, in one sentence. */
  readonly rule: string
  /** What follows from it for us. */
  readonly then: string
}

export const LAWS: Readonly<Record<LawKey, Law>> = {
  conservation: {
    name: "Conservation",
    rule: "Every game hands out exactly one win.",
    then: "Inside the conference, a win only moves from one team to another. A loss to the other conference takes a win out of the race.",
  },
  kinds: {
    name: "Four kinds of game",
    rule: "Ours, theirs against the other conference, the other conference against itself, and theirs against each other.",
    then: "Our win never hurts. Their loss to the other conference helps or does nothing. The other conference playing itself never matters. Their games against each other can go either way.",
  },
  room: {
    name: "Who can afford the win",
    rule: "When two conference teams meet, one of them gets the win.",
    then: "Which one is better for us depends on room: a team far below our line can take the win without passing us, a team close to it can't.",
  },
}

/**
 * The law this week shows: on a bye, the four kinds (only the league moved);
 * otherwise the kind of the league's biggest result.
 */
export function lawOf(week: StoryWeek): LawKey {
  const top = leagueResults(week)[0]
  if (week.game === null || top === undefined) return "kinds"
  return top.kind === "exported" ? "conservation" : "room"
}
