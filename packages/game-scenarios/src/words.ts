/**
 * What the screen says about each scenario beyond its name: the phase
 * headings, and a label for each outcome home can fill in. The name and what
 * a scenario covers come from the catalog itself (`catalog.ts`).
 *
 * Keyed by every id in the catalog's copy; `__tests__/catalog.test.ts` fails
 * when an id or an outcome has no words here, or words name one the copy does
 * not have.
 */
import type { Phase } from "@game-scenarios/catalog"

export const PHASE_TITLES: Readonly<Record<Phase, string>> = {
  pre: "Before kickoff",
  in: "During the game",
  post: "After the final",
  you: "You, watching or not",
}

const WATCHING = { result: "The result", stretch: "A stretch of the game" }

export const OUTCOME_WORDS = {
  "pre.weather": { rain: "Rain", snow: "Snow", wind: "Wind", clear: "Clear" },
  "pre.injury-report": {
    "key-player-out": "Key player out",
    questionable: "Questionable",
    "all-clear": "All clear",
  },
  "pre.venue": { home: "Home", road: "Road", neutral: "Neutral site" },
  "pre.coin-toss": {
    "won-received": "Won it, took the ball",
    "won-deferred": "Won it, deferred",
    "lost-received": "Lost it, they took the ball",
    "lost-deferred": "Lost it, they deferred",
  },
  "pre.stakes": { "must-win": "Must win", "can-afford-it": "Can afford it" },
  "in.first-drive": { scored: "Scored", stalled: "Stalled" },
  "in.fell-behind": {
    "fell-behind": "Fell behind",
    "took-the-lead-back": "Took the lead back",
  },
  "in.third-long": { converted: "Converted", stopped: "Stopped" },
  "in.fourth-down": {
    "went-for-it": "Went for it",
    "field-goal": "Kicked a field goal",
    punted: "Punted",
  },
  "in.two-point": {
    "went-for-two": "Went for 2",
    kicked: "Kicked the extra point",
  },
  "in.play-call": {
    ran: "Ran",
    "threw-short": "Threw short",
    "threw-deep": "Threw deep",
  },
  "in.red-zone": {
    touchdown: "Touchdown",
    "field-goal": "Field goal",
    empty: "Came away empty",
  },
  "in.two-minute": { scored: "Scored", "ran-out-of-time": "Ran out of time" },
  "in.turnover": {
    interception: "Interception",
    fumble: "Fumble",
    "on-downs": "On downs",
  },
  "in.penalty": {
    "for-us-called": "For us, called",
    "for-us-missed": "For us, missed",
    "against-us-called": "Against us, called",
    "against-us-missed": "Against us, missed",
  },
  "in.sack": { "took-one": "Took one", "got-one": "Got one" },
  "in.big-play": { "for-us": "For us", "against-us": "Against us" },
  "in.kick": { made: "Made", missed: "Missed", blocked: "Blocked" },
  "in.injury": { out: "Out", "came-back": "Came back" },
  "post.result": { won: "Won", lost: "Lost", tied: "Tied" },
  "post.paths": { "paths-kept": "Paths kept", "paths-lost": "Paths lost" },
  "post.pattern": {
    "fits-the-pattern": "Fits the pattern",
    "breaks-it": "Breaks it",
  },
  "you.caught-it": WATCHING,
  "you.sat-through": WATCHING,
  "you.missed-it": WATCHING,
  "you.dodged-it": WATCHING,
  "you.tuned-in-late": WATCHING,
} as const satisfies Record<string, Readonly<Record<string, string>>>

/** Every scenario id this version of some-ui draws. */
export type ScenarioId = keyof typeof OUTCOME_WORDS
