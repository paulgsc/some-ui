/**
 * What the screen says about each scenario beyond its name: the phase
 * headings, and a label for each outcome home can fill in. The name and what
 * a scenario covers come from the catalog itself (`catalog.ts`).
 */
import type {
  BigPlayKind,
  BigPlaySize,
  Half,
  Measure,
  Phase,
  Unit,
  Verdict,
} from "@game-scenarios/catalog"

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
  "in.halftime": { leading: "Leading", trailing: "Trailing", tied: "Tied" },
  "in.onside-kick": { ours: "We recovered it", theirs: "They recovered it" },
} as const satisfies Record<string, Readonly<Record<string, string>>>

/** Every scenario id this version of some-ui draws. */
export type ScenarioId = keyof typeof OUTCOME_WORDS

export const HALF_WORDS: Readonly<Record<Half, string>> = {
  first: "1st half",
  second: "2nd half",
  overtime: "Overtime",
}

export const BIG_PLAY_SIZE_WORDS: Readonly<Record<BigPlaySize, string>> = {
  big: "Big",
  huge: "Huge",
  memorable: "One to remember",
}

export const BIG_PLAY_KIND_WORDS: Readonly<Record<BigPlayKind, string>> = {
  pass: "Pass",
  run: "Run",
  "kick-return": "Kick return",
  "punt-return": "Punt return",
  "interception-return": "Interception return",
  "fumble-return": "Fumble return",
}

export const UNIT_WORDS: Readonly<Record<Unit, string>> = {
  offense: "Offense",
  defense: "Defense",
  "special-teams": "Special teams",
  coaching: "Coaching",
}

/** What each measure counts, as a claim and the essay say it (#3041, D26). */
export const MEASURE_WORDS: Readonly<Record<Measure, string>> = {
  "pass-rush": "Pass rush: sacks per opponent dropback",
  "third-down": "Third-down conversions",
  "red-zone": "Red-zone touchdowns per trip",
  "fourth-down-go": "Going for it on fourth down",
  "two-minute": "Points per two-minute drive",
  "timeouts-at-half": "Timeouts left at the half",
  takeaways: "Turnovers forced",
  "explosives-allowed": "Explosive plays allowed",
}

/** Where a claim stands, in the words the essay and Takes show (#3041). */
export const VERDICT_WORDS: Readonly<Record<Verdict, string>> = {
  holding: "Holding",
  "against-so-far": "Against you so far",
  "too-early": "Too early to tell",
  "settled-right": "You were right",
  "settled-wrong": "You were wrong",
  withdrawn: "Withdrawn: its bite was deleted",
}
