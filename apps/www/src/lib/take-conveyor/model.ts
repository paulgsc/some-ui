/**
 * Studio's takes on a conveyor (CONVEYOR1, #2873; epic #2872): every Studio
 * take stands at one of the owner's stations (the pizza names, ask #2876),
 * and the owner moves it along. A take home keeps with no move is In the
 * oven, so recording asks nothing. An idea's answer is on no conveyor:
 * home names no station for it. Pure, so every rule is held by a test;
 * `./runtime` keeps the moves and hands them to home (paulgsc/server
 * `studio_take_move`, `POST /voice-notes/:id/station`).
 *
 * Rules that hold by structure:
 *
 * - **No move is lost or rewritten.** `stepConveyor` only appends a move or
 *   records how home answered it; nothing removes one (CLAUDE.md, "Never
 *   lose the record"). Home keeps every move too, each as its own row.
 * - **The phone moves only as home allows.** To Cooking, Ready for pickup
 *   or Canned, from anywhere but there and Picked up (`moveOf`). Nothing
 *   goes back In the oven, and Picked up is the pickup's alone (CONVEYOR3)
 *   and final.
 * - **A move names where it was made from.** Home keeps it only while the
 *   take still stands there; a move made from a station the take has left
 *   (on another device, or by the pickup) is dropped, with where home says
 *   the take is, and said (`stationOf`'s `missed`). A move home didn't keep
 *   takes the phone's later moves of the same take with it, since each was
 *   made from where the one before would have put it.
 * - **A move says where the take is until home says later.** The station
 *   shown is the newer of the phone's latest kept-or-owed move and home's
 *   own word on the take, by when each was made (`stationOf`).
 */
import { assertNever, isRecord } from "@some-ui/core-utils"

/** The stations, in the order a take moves along them, as home names them. */
export const TAKE_STATIONS = [
  "in-the-oven",
  "cooking",
  "ready-for-pickup",
  "picked-up",
  "canned",
] as const

export type TakeStation = (typeof TAKE_STATIONS)[number]

/** Where a take stands before anyone moves it: on recording. */
export const FIRST_STATION: TakeStation = "in-the-oven"

/** The stations the owner moves a take to on the phone. */
export const MOVABLE_STATIONS: ReadonlyArray<TakeStation> = [
  "cooking",
  "ready-for-pickup",
  "canned",
]

/** As home takes them: at most this many labels on a take… */
export const LABELS_MAX = 8
/** …each at most this many characters… */
export const LABEL_CHARS = 32
/** …and a comment of at most this many. */
export const COMMENT_CHARS = 280

export const isTakeStation = (value: unknown): value is TakeStation =>
  TAKE_STATIONS.some((station) => station === value)

/** One move of one take, as the owner made it. */
export type StationMove = {
  /** The phone's own name for the move, so home's answer finds it. */
  readonly move: string
  /** The take's id (its voice note's, as home keeps it). */
  readonly take: string
  /** Where the take stood when the owner moved it. */
  readonly from: TakeStation
  readonly to: TakeStation
  /** When the owner moved it (ISO 8601). */
  readonly at: string
  /** The take's labels from now on; null keeps the ones it has. */
  readonly labels: ReadonlyArray<string> | null
  readonly comment: string | null
}

/**
 * How home answered a move: not yet, kept, refused as it is, or dropped
 * because the take had already left the station it was made from.
 */
type MoveHome = "owed" | "held" | "refused" | "stale"

type KeptMove = StationMove & {
  readonly home: MoveHome
  /** On a stale move: where home said the take was instead, if it said. */
  readonly there?: TakeStation | undefined
}

/** Every move made on this phone, oldest first. */
export type ConveyorState = { readonly moves: ReadonlyArray<KeptMove> }

export const INITIAL_CONVEYOR: ConveyorState = { moves: [] }

export type ConveyorEvent =
  | { readonly kind: "moved"; readonly move: StationMove }
  /** Home kept the move (or had kept it already). */
  | { readonly kind: "held"; readonly move: string }
  /** Home will never keep the move as it is. */
  | { readonly kind: "refused"; readonly move: string }
  /** The take had left the station the move was made from, for `there`. */
  | {
      readonly kind: "stale"
      readonly move: string
      readonly there: TakeStation | null
    }

/**
 * How home answered `move`, from owed; a move never goes back to owed. A
 * move home didn't keep makes each later owed move of the same take stale
 * with it: each was made from where the one before would have put it.
 */
function answered(
  state: ConveyorState,
  move: string,
  home: Exclude<MoveHome, "owed">,
  there: TakeStation | null = null
): ConveyorState {
  const at = state.moves.findIndex(
    (kept) => kept.move === move && kept.home === "owed"
  )
  if (at === -1) return state
  const { take } = state.moves[at]
  const unkept = home !== "held"
  return {
    moves: state.moves.map((kept, index) => {
      if (index === at) {
        return there === null ? { ...kept, home } : { ...kept, home, there }
      }
      return unkept && index > at && kept.take === take && kept.home === "owed"
        ? { ...kept, home: "stale" }
        : kept
    }),
  }
}

export function stepConveyor(
  state: ConveyorState,
  event: ConveyorEvent
): ConveyorState {
  switch (event.kind) {
    case "moved": {
      if (state.moves.some((kept) => kept.move === event.move.move)) {
        return state
      }
      return { moves: [...state.moves, { ...event.move, home: "owed" }] }
    }
    case "held":
    case "refused": {
      return answered(state, event.move, event.kind)
    }
    case "stale": {
      return answered(state, event.move, "stale", event.there)
    }
    default: {
      return assertNever(event)
    }
  }
}

/** The moves home hasn't answered yet, oldest first. */
export const movesOwed = (state: ConveyorState): ReadonlyArray<StationMove> =>
  state.moves
    .filter((kept) => kept.home === "owed")
    .map(({ home: _home, there: _there, ...move }) => move)

/** What home says of a take's station, when it says anything. */
export type HomeStation = {
  /** Null: on no conveyor (an idea's answer). Absent: a home before it. */
  readonly station?: TakeStation | null | undefined
  /** When home's newest move of it was made; null while it has none. */
  readonly stationAt?: string | null | undefined
}

/** What home says of a take, read as stations this phone knows. */
export const homeStationOf = (take: {
  readonly station?: string | null | undefined
  readonly stationAt?: string | null | undefined
}): HomeStation => ({
  station:
    take.station === null
      ? null
      : isTakeStation(take.station)
        ? take.station
        : undefined,
  stationAt: take.stationAt,
})

/** The labels typed, with commas between; none typed keeps the take's. */
export function labelsOf(typed: string): ReadonlyArray<string> | null {
  const labels = typed.split(",").map((label) => label.trim())
  return labels.some(Boolean) ? labels : null
}

/** Why the phone's latest move of a take didn't reach home. */
type Missed = {
  readonly to: TakeStation
  readonly why: "refused" | "stale"
}

/** Where a take stands, and whether home has heard of it yet. */
export type TakeStanding = {
  readonly station: TakeStation
  /** When it was moved there; null for a take never moved. */
  readonly at: string | null
  /** Moved on this phone, and home hasn't kept that move yet. */
  readonly going: boolean
  /** The phone's latest move of it, which home didn't keep; else null. */
  readonly missed: Missed | null
}

const later = (a: string, b: string): boolean =>
  new Date(a).getTime() > new Date(b).getTime()

/**
 * Where take `id` stands: the newer of the phone's latest kept-or-owed move
 * and home's word, unless a move after it went unkept, which says where it
 * found the take (a stale move's `there`), and is itself said (`missed`,
 * the first of those). Null for a take on no conveyor, and for one home
 * says nothing of (a home before the conveyor) that the phone never moved.
 */
export function stationOf(
  id: string,
  home: HomeStation,
  state: ConveyorState
): TakeStanding | null {
  if (home.station === null) return null
  const homeAt = home.stationAt ?? null
  const newer = (at: string): boolean => homeAt === null || later(at, homeAt)
  const mine = state.moves.filter((kept) => kept.take === id)
  const lastTaken = mine.reduce(
    (last, kept, index) =>
      kept.home === "owed" || kept.home === "held" ? index : last,
    -1
  )
  const taken = lastTaken === -1 ? undefined : mine[lastTaken]
  const unkept = mine.slice(lastTaken + 1).find((kept) => newer(kept.at))
  const missed: Missed | null =
    unkept === undefined
      ? null
      : { to: unkept.to, why: unkept.home === "stale" ? "stale" : "refused" }
  if (unkept?.there !== undefined) {
    return { station: unkept.there, at: null, going: false, missed }
  }
  if (taken !== undefined && newer(taken.at)) {
    return {
      station: taken.to,
      at: taken.at,
      going: taken.home === "owed",
      missed,
    }
  }
  if (home.station === undefined && mine.length === 0) return null
  return {
    station: home.station ?? FIRST_STATION,
    at: homeAt,
    going: false,
    missed,
  }
}

/** What home won't keep in a label or a comment: a control character. */
const CONTROL = /\p{Cc}/u

/** What the owner asks for: a take, where to, and what rides along. */
export type MoveAsked = {
  readonly take: string
  readonly from: TakeStation
  readonly to: TakeStation
  /** The take's labels from now on; null or absent keeps them. */
  readonly labels?: ReadonlyArray<string> | null
  readonly comment?: string | null
}

/** Why a move can't be made as asked. */
export type MoveRefused =
  | "here"
  | "pickup"
  | "final"
  | "oven"
  | "labels"
  | "comment"

/**
 * The move the owner asked for, made `move` at `at`, or why it can't be:
 * it is already there, Picked up is the pickup's and final, nothing goes
 * back In the oven, or what rides along is more than home keeps or holds a
 * control character (a line break). Labels are trimmed, blanks and repeats
 * dropped, none left keeps the take's, and a blank comment is none.
 */
export function moveOf(
  asked: MoveAsked,
  move: string,
  at: string
):
  | { readonly kind: "move"; readonly move: StationMove }
  | { readonly kind: "refused"; readonly why: MoveRefused } {
  if (asked.to === asked.from) return { kind: "refused", why: "here" }
  if (asked.to === "picked-up") return { kind: "refused", why: "pickup" }
  if (asked.from === "picked-up") return { kind: "refused", why: "final" }
  if (asked.to === "in-the-oven") return { kind: "refused", why: "oven" }
  const typed = [
    ...new Set((asked.labels ?? []).map((label) => label.trim())),
  ].filter(Boolean)
  // None typed keeps the take's labels, as home reads an absent list.
  const labels = typed.length === 0 ? null : typed
  if (
    labels !== null &&
    (labels.length > LABELS_MAX ||
      labels.some(
        (label) => [...label].length > LABEL_CHARS || CONTROL.test(label)
      ))
  ) {
    return { kind: "refused", why: "labels" }
  }
  const comment = asked.comment?.trim() ?? ""
  if ([...comment].length > COMMENT_CHARS || CONTROL.test(comment)) {
    return { kind: "refused", why: "comment" }
  }
  return {
    kind: "move",
    move: {
      move,
      take: asked.take,
      from: asked.from,
      to: asked.to,
      at,
      labels,
      comment: comment === "" ? null : comment,
    },
  }
}

const isStrings = (value: unknown): value is Array<string> =>
  Array.isArray(value) && value.every((item) => typeof item === "string")

const HOMES: ReadonlyArray<MoveHome> = ["owed", "held", "refused", "stale"]

function isKeptMove(kept: unknown): kept is KeptMove {
  return (
    isRecord(kept) &&
    typeof kept.move === "string" &&
    typeof kept.take === "string" &&
    isTakeStation(kept.from) &&
    isTakeStation(kept.to) &&
    typeof kept.at === "string" &&
    (kept.labels === null || isStrings(kept.labels)) &&
    (kept.comment === null || typeof kept.comment === "string") &&
    HOMES.some((home) => home === kept.home) &&
    (kept.there === undefined || isTakeStation(kept.there))
  )
}

/** The record as storage keeps it, or null for one this can't read. */
export function parseConveyor(value: unknown): ConveyorState | null {
  if (!isRecord(value)) return null
  const { moves } = value
  if (!Array.isArray(moves) || !moves.every(isKeptMove)) return null
  return { moves }
}
