/**
 * Where something the phone sent is now (J0, "never silent"): one closed set
 * of states, each with one road, one theme and one set of words, wherever it
 * shows. Each record kept on home maps its own record into them (the Jobs
 * files: `lib/jobs/journey`); this module holds what every one of them
 * shares, and `components/journey-status` draws it. Pure, and the one place
 * these words live, so they stay in the person's terms: what is where, and
 * since when (`__tests__/journey.test.ts`).
 *
 * Two roads lead to the morning run: home's, which hands a file to the run's
 * mailbox without a tap, and the share sheet's, to Drive.
 *
 * It sits outside `lib/home-link`, which only the screens LA8 names may
 * import: these are words and pictures, and reach nothing.
 */
import { assertNever } from "@some-ui/core-utils"

/** The places a file can be: the stops its road passes. */
export type Stop = "phone" | "home" | "mailbox" | "drive" | "run"

export const JOURNEY_IDS = [
  "on-phone",
  "with-home",
  "in-mailbox",
  "read",
  "missed-run",
  "home-refused",
  "mailbox-refused",
  "needs-sheet",
  "sheet-unconfirmed",
  "in-drive",
] as const

export type JourneyId = (typeof JOURNEY_IDS)[number]

/** The four kinds of state, each its own color. */
export type JourneyTheme = "waiting" | "moving" | "read" | "stopped"

/** A stop as the road draws it. */
export type Mark = "reached" | "stopped" | "unconfirmed" | "ahead"

/** The way between two stops: passed, under way, broken, or not yet. */
export type Leg = "passed" | "under-way" | "broken" | "ahead"

export type Road = {
  readonly stops: ReadonlyArray<Stop>
  readonly marks: ReadonlyArray<Mark>
  /** One fewer than `stops`: `legs[i]` joins stop `i` to stop `i + 1`. */
  readonly legs: ReadonlyArray<Leg>
}

/** Which road a file takes: home's, or the share sheet's to Drive. */
type Via = "home" | "drive"

/** Why a file goes by the share sheet. */
type SheetWhy = "voice" | "not-kept"

/** One file's state now, and what its words need. */
export type Journey = {
  readonly id: JourneyId
  /** The road `read` was reached by; the others each have their own. */
  readonly via: Via
  /** When it reached the stop it is at (ISO), where its words say so. */
  readonly since: string | null
  /** The day of the run that read or missed it, `YYYY-MM-DD`. */
  readonly runDay: string | null
  /** For `needs-sheet`: why it goes that way. */
  readonly why: SheetWhy | null
}

/** A journey with only what `id` needs; the rest left empty. */
export function journey(
  id: JourneyId,
  more: Partial<Omit<Journey, "id">> = {}
): Journey {
  return {
    id,
    via: more.via ?? (DRIVE_STATES.has(id) ? "drive" : "home"),
    since: more.since ?? null,
    runDay: more.runDay ?? null,
    why: more.why ?? null,
  }
}

const HOME_ROAD: ReadonlyArray<Stop> = ["phone", "home", "mailbox", "run"]
const DRIVE_ROAD: ReadonlyArray<Stop> = ["phone", "drive", "run"]

const DRIVE_STATES: ReadonlySet<JourneyId> = new Set([
  "needs-sheet",
  "sheet-unconfirmed",
  "in-drive",
])

const R = "reached"
const S = "stopped"
const U = "unconfirmed"
const A = "ahead"

/** Each state's theme, the stop its icon shows, and its road. */
const SHAPES: Readonly<
  Record<
    JourneyId,
    {
      theme: JourneyTheme
      at: Stop
      marks: ReadonlyArray<Mark>
      legs: ReadonlyArray<Leg>
    }
  >
> = {
  "on-phone": {
    theme: "waiting",
    at: "phone",
    marks: [R, A, A, A],
    legs: ["under-way", "ahead", "ahead"],
  },
  "with-home": {
    theme: "moving",
    at: "home",
    marks: [R, R, A, A],
    legs: ["passed", "under-way", "ahead"],
  },
  "in-mailbox": {
    theme: "moving",
    at: "mailbox",
    marks: [R, R, R, A],
    legs: ["passed", "passed", "under-way"],
  },
  read: {
    theme: "read",
    at: "run",
    marks: [R, R, R, R],
    legs: ["passed", "passed", "passed"],
  },
  "missed-run": {
    theme: "stopped",
    at: "run",
    marks: [R, R, A, S],
    legs: ["passed", "broken", "broken"],
  },
  "home-refused": {
    theme: "stopped",
    at: "home",
    marks: [R, S, A, A],
    legs: ["broken", "ahead", "ahead"],
  },
  "mailbox-refused": {
    theme: "stopped",
    at: "mailbox",
    marks: [R, R, S, A],
    legs: ["passed", "broken", "ahead"],
  },
  "needs-sheet": {
    theme: "waiting",
    at: "drive",
    marks: [R, A, A],
    legs: ["under-way", "ahead"],
  },
  "sheet-unconfirmed": {
    theme: "waiting",
    at: "drive",
    marks: [R, U, A],
    legs: ["under-way", "ahead"],
  },
  "in-drive": {
    theme: "moving",
    at: "drive",
    marks: [R, R, A],
    legs: ["passed", "under-way"],
  },
}

export function themeOf(id: JourneyId): JourneyTheme {
  return SHAPES[id].theme
}

/** The stop the file is at: the icon its card shows. */
export function stopOf(id: JourneyId): Stop {
  return SHAPES[id].at
}

/** The whole road, drawn for `j`. A file read via Drive took Drive's road. */
export function roadOf(j: Pick<Journey, "id" | "via">): Road {
  const { marks, legs } = SHAPES[j.id]
  if (j.id === "read" && j.via === "drive") {
    return {
      stops: DRIVE_ROAD,
      marks: [R, R, R],
      legs: ["passed", "passed"],
    }
  }
  return { stops: DRIVE_STATES.has(j.id) ? DRIVE_ROAD : HOME_ROAD, marks, legs }
}

/** Most in need of the person first: the order a card picks its state by. */
const URGENCY: ReadonlyArray<JourneyTheme> = [
  "stopped",
  "waiting",
  "moving",
  "read",
]

/** The one of `journeys` most in need of the person, or null for none. */
export function mostUrgent(journeys: ReadonlyArray<Journey>): Journey | null {
  let found: Journey | null = null
  for (const j of journeys) {
    if (
      found === null ||
      URGENCY.indexOf(themeOf(j.id)) < URGENCY.indexOf(themeOf(found.id))
    ) {
      found = j
    }
  }
  return found
}

// The words.

/** What a card holds: one file, or several. */
export type Noun = "it" | "them"

/** A stop's name, as the road labels it. */
export const STOP_NAMES: Readonly<Record<Stop, string>> = {
  phone: "Phone",
  home: "Home",
  mailbox: "Mailbox",
  drive: "Drive",
  run: "Run",
}

/** `at` as the time of day, with its date when it is not `now`'s day. */
export function whenSaid(at: string, now: Date): string {
  const then = new Date(at)
  const time = then.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })
  if (then.toDateString() === now.toDateString()) return time
  const day = then.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })
  return `${day}, ${time}`
}

/** A run's day, `YYYY-MM-DD`, as "Oct 25". */
export function runDaySaid(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
}

/** What a state says: its name, and a line on where it is and what comes next. */
export type Said = { readonly title: string; readonly line: string }

/** The words of `j`, about one file (`it`) or several (`them`), at `now`. */
export function journeySaid(j: Journey, noun: Noun, now: Date): Said {
  const many = noun === "them"
  const it = noun
  const they = many ? "they" : "it"
  const since = j.since === null ? null : whenSaid(j.since, now)
  const run = j.runDay === null ? "the last" : `the ${runDaySaid(j.runDay)}`
  switch (j.id) {
    case "on-phone": {
      return {
        title: "On this phone",
        line: `Not sent yet. On the home Wi‑Fi, home takes ${it} without a tap, or share ${it} to Drive now.`,
      }
    }
    case "with-home": {
      return {
        title: `Home has ${it}`,
        line: `${since === null ? "Taken" : `Since ${since},`} without a tap. Home hands ${it} to the run’s mailbox within about 15 minutes, and the next morning run reads ${it}.`,
      }
    }
    case "in-mailbox": {
      return {
        title: "In the run’s mailbox",
        line: `${since === null ? "There now" : `Since ${since}`}. The next morning run reads ${it}.`,
      }
    }
    case "read": {
      return {
        title: "Read by the morning run",
        line: `${capital(run)} run read ${it}.`,
      }
    }
    case "missed-run": {
      return {
        title: "Didn’t reach the morning run",
        line: `Home has had ${it}${since === null ? "" : ` since ${since}`}, but ${run} run didn’t read ${it}. Share ${it} to Drive so the next one does.`,
      }
    }
    case "home-refused": {
      return {
        title: `Home wouldn’t take ${it}`,
        line: `Share ${it} to Drive instead, so the morning run still reads ${it}.`,
      }
    }
    case "mailbox-refused": {
      return {
        title: `The run’s mailbox wouldn’t take ${it}`,
        line: `${since === null ? "Home tried" : `Home tried at ${since}`}. Share ${it} to Drive so the morning run still reads ${it}.`,
      }
    }
    case "needs-sheet": {
      return {
        title: "Goes by the share sheet",
        line:
          j.why === "not-kept"
            ? `Jobs isn’t kept on home, so nothing goes there by itself. Share ${it} to Drive.`
            : `A voice note rides along, and home keeps no audio. Share ${it} to Drive.`,
      }
    }
    case "sheet-unconfirmed": {
      return {
        title: "Shared, not confirmed",
        line: `Did ${they} arrive in Drive? Until you say so, ${they} ${many ? "stay" : "stays"} on offer.`,
      }
    }
    case "in-drive": {
      return {
        title: "In Drive",
        line: `You said ${they} arrived${since === null ? "" : ` at ${since}`}. The next morning run reads ${it}.`,
      }
    }
    default: {
      return assertNever(j.id)
    }
  }
}

/** Each state's name, for the pop-up's list of every state. */
export function stateTitle(id: JourneyId, noun: Noun): string {
  return journeySaid(journey(id), noun, new Date(0)).title
}

/** The icon's spoken name: where it is, and what pressing it shows. */
export function iconLabel(said: Said, noun: Noun): string {
  return `${said.title}. Show where ${noun === "them" ? "they are" : "it is"}`
}

/** The road's spoken name. */
export function roadSaid(road: Road): string {
  const reached = road.stops.filter((_, i) => road.marks[i] === "reached")
  const stopped = road.stops.find((_, i) => road.marks[i] === "stopped")
  const parts = [
    `Reached: ${reached.map((s) => STOP_NAMES[s]).join(", ")}`,
    ...(stopped === undefined ? [] : [`stopped at ${STOP_NAMES[stopped]}`]),
  ]
  return `${parts.join("; ")}.`
}

/** The heading over the pop-up's list. */
export const everyState = "Every state"

function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
