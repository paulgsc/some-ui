/**
 * The short's vocabulary (owner, 2026-11-03, on #2555): every word it says
 * about a week, in one pure table. A word here works like a chess piece's
 * name: taught once, in the legend episode, then used every week to mean the
 * same thing (`__tests__/words.test.ts`).
 *
 * The grammar is discrete events, never a weight: every number is an extreme
 * over every way the rest of the season can go, with its proof.
 *
 * - **Pieces** are games, named only by who plays, so a noun never changes.
 * - **The poles**: the floor (the best case for us) and the ceiling (the
 *   worst), for our division's rivals and our conference's. The bloc is the
 *   floor's proof.
 * - **A result** moved us toward one pole, was forced, or was idle; made and
 *   missed are the first two.
 * - **An objective** (the division, the #1 seed) is clinched, in our hands,
 *   needs help, or out, with two countdowns.
 * - **The ladder** is the outcomes, best first; each week names the best rung
 *   still reachable and the worst already ours. **The call** reads it.
 *
 * Words say what can still happen ("however the rest goes"), never a
 * forecast (CLAUDE.md, "Say what it is").
 */

import type { StoryCohort, StoryKind } from "./story"

/** A piece's noun: who plays decides it, and so how its result can move us. */
export type PieceNoun = StoryKind | "outside"

export const PIECES: Readonly<
  Record<
    PieceNoun,
    {
      readonly noun: string
      /** Who plays it. */
      readonly who: string
      /** How its result can move us: the rule that never changes. */
      readonly moves: string
    }
  >
> = {
  own: {
    noun: "our light",
    who: "Us.",
    moves: "A win always helps.",
  },
  exported: {
    noun: "one-way",
    who: "A rival against the other conference.",
    moves:
      "It only goes one way at a time: the rival's loss helps us or does nothing, its win hurts us or does nothing.",
  },
  inside: {
    noun: "crossroads",
    who: "Two rivals.",
    moves:
      "Forced: one of them gets the win whichever way it goes, and which one can still move a pole.",
  },
  outside: {
    noun: "side street",
    who: "Two teams outside our conference.",
    moves: "Never on our route.",
  },
}

/** The order the legend teaches the pieces in. */
export const PIECE_ORDER: ReadonlyArray<PieceNoun> = [
  "own",
  "exported",
  "inside",
  "outside",
]

/** The poles, and the floor's proof. */
export const POLES = {
  floor: {
    word: "the floor",
    means:
      "if everything goes our way, the fewest wins our best rival can be held to",
  },
  ceiling: {
    word: "the ceiling",
    means:
      "if everything goes against us, the most wins a rival can still reach",
  },
  bloc: {
    word: "the bloc",
    means:
      "rivals who still play each other: however those games go, one of them reaches the floor",
  },
} as const

/** Our two groups of rivals. */
export const GROUPS = {
  division: { word: "our division" },
  conference: { word: "our conference" },
} as const

export type GroupKey = keyof typeof GROUPS

/** A result's cohort, for one group. */
export const COHORTS: Readonly<
  Record<
    StoryCohort,
    { readonly phrase: string; readonly verb: string; readonly means: string }
  >
> = {
  best: {
    phrase: "toward the best case",
    verb: "made",
    means: "it lowered a rival's reach, or won us a game",
  },
  worst: {
    phrase: "toward the worst case",
    verb: "missed",
    means: "it raised the floor or a rival's reach, or cost us a game",
  },
  forced: {
    phrase: "forced",
    verb: "forced",
    means:
      "two rivals played: one of them had to win it, and which one can still move a pole",
  },
  idle: {
    phrase: "idle",
    verb: "idle",
    means: "neither pole moved",
  },
}

/** The order cohorts are listed in. */
export const COHORT_ORDER: ReadonlyArray<StoryCohort> = [
  "best",
  "worst",
  "forced",
  "idle",
]

/** Earned, and literal. */
export const CLEAN_RUN = {
  phrase: "a clean run",
  means: "a week where neither floor rose and our best finish held",
} as const

/** What we play for, against a group. */
export const OBJECTIVES: Readonly<
  Record<GroupKey, { readonly word: string; readonly against: string }>
> = {
  division: { word: "the division", against: "our division rivals" },
  conference: { word: "the #1 seed", against: "the whole conference" },
}

export type Standing = "clinched" | "hands" | "help" | "out"

/** Where an objective stands; each is a fact about every way the rest can go. */
export const STANDINGS: Readonly<
  Record<Standing, { readonly phrase: string; readonly means: string }>
> = {
  clinched: { phrase: "Clinched", means: "ours however the rest goes" },
  hands: {
    phrase: "In our hands",
    means: "if we win out it's ours, whatever else happens",
  },
  help: {
    phrase: "Needs help",
    means: "still there, if other results go our way",
  },
  out: { phrase: "Out", means: "no way left" },
}

export const STANDING_ORDER: ReadonlyArray<Standing> = [
  "clinched",
  "hands",
  "help",
  "out",
]

/** The two countdowns of an objective. */
export const COUNTDOWNS = {
  greens: {
    phrase: "greens to go",
    one: "green to go",
    means:
      "the most a rival can still reach, less our wins: each win of ours takes one off, and so does a loss by the only rival who can reach that far",
  },
  reds: {
    phrase: "reds to spare",
    one: "red to spare",
    means:
      "our best finish, less the floor: each game we don't win spends one, and so does the floor rising",
  },
} as const

/**
 * How far a week moved the poles, before to after. Counted in wins: the
 * most a rival can reach falling and our own wins count our way, the floor
 * rising and our best finish dropping count against us.
 */
export const STEPS = {
  ours: { phrase: "our way", one: "step", many: "steps" },
  against: { phrase: "against us", one: "step", many: "steps" },
} as const

export type Rung = "top" | "division" | "wildcard" | "out"

/** The ladder of outcomes, best first: the utility, in order. */
export const RUNGS: Readonly<
  Record<Rung, { readonly phrase: string; readonly seeds: string }>
> = {
  top: { phrase: "the #1 seed", seeds: "seed 1" },
  division: { phrase: "a division title", seeds: "seeds 2 to 4" },
  wildcard: { phrase: "a wild card", seeds: "seeds 5 to 7" },
  out: { phrase: "out", seeds: "no seed" },
}

export const RUNG_ORDER: ReadonlyArray<Rung> = [
  "top",
  "division",
  "wildcard",
  "out",
]

export type Call = "keep-driving" | "arrived" | "dead-end"

/**
 * The call, read off the ladder. Each is a fact, not a rule: the ladder is
 * open, it closed on a seat, or no seat is left.
 */
export const CALLS: Readonly<
  Record<Call, { readonly phrase: string; readonly means: string }>
> = {
  "keep-driving": {
    phrase: "Keep driving",
    means: "the best rung and the worst are still apart: there is more to see",
  },
  arrived: {
    phrase: "Arrived",
    means:
      "the best rung and the worst met on a seat: the rest of the season can't change which rung we land on",
  },
  "dead-end": {
    phrase: "Dead end",
    means: "no seat is left",
  },
}

/**
 * The upload's copy (SHOW SH5): the title and description every episode
 * goes up with, filled from its week by `uploadOf` (`./show`), in the same
 * words the short says. A draft for the owner, who uploads by hand.
 */
export const UPLOAD = {
  /** "Playoff Delta · 2026 week 7 · Keep driving". */
  weekTitle: (label: string, week: number, call: string): string =>
    `Playoff Delta · ${label} week ${week} · ${call}`,
  /** "Playoff Delta · 2026 · the legend". */
  legendTitle: (label: string): string =>
    `Playoff Delta · ${label} · the legend`,
  /** The description's first line: whose week, and our own game. */
  weekOpening: (
    label: string,
    week: number,
    team: string,
    game: string
  ): string => `${label} week ${week}, read from the ${team}' side. ${game}`,
  won: (opponent: string): string => `We beat the ${opponent}.`,
  lost: (opponent: string): string => `We lost to the ${opponent}.`,
  bye: "Our bye week.",
  legendOpening: (label: string, team: string): string =>
    `The words every week of Playoff Delta uses, and what each one means, read on the ${team}' ${label} season.`,
} as const

/** "one" to "ten" in words, digits past that. */
export function numberWord(n: number): string {
  const words = [
    "no",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
  ]
  return words[n] ?? String(n)
}
