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
 *   takes with it the phone's later moves of the take made from where it
 *   would have put the take; a move made from home's word stays owed.
 * - **Moves are ordered by number, never by a clock.** A move names the
 *   take's newest move number it was made from (`seq`); home keeps it only
 *   while that is still the newest, and the station shown is the phone's
 *   latest move while it is ahead of home's number, else home's word
 *   (`stationOf`). A phone's clock never orders moves: it dates them, and
 *   home holds back one dated past its own clock until that catches up.
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
  /** When the owner moved it (ISO 8601): said, never used to order moves. */
  readonly at: string
  /**
   * The take's newest move number as the owner saw it when moving (0 for a
   * take never moved): home keeps the move only while that is still the
   * newest, so moves are ordered by number, never by a clock.
   */
  readonly seq: number
  /** The take's labels from now on; null keeps the ones it has. */
  readonly labels: ReadonlyArray<string> | null
  readonly comment: string | null
}

/**
 * How home answered a move: not yet, kept, refused as it is, dropped
 * because the take had moved on since it was made, or dropped because the
 * take is off the conveyor (let go, or not one home keeps on it), or
 * dropped with an earlier move of the take it was made along (`chained`).
 */
type MoveHome = "owed" | "held" | "refused" | "stale" | "off" | "chained"

/** Where home said the take was, on a stale move: its station and number. */
export type There = { readonly station: TakeStation; readonly seq: number }

type KeptMove = StationMove & {
  readonly home: MoveHome
  /** On a stale move: where home said the take was instead, if it said. */
  readonly there?: There | undefined
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
  /** The take is off the conveyor: home keeps no moves of it. */
  | { readonly kind: "off"; readonly move: string }
  /** The take had moved on since the move was made, to `there`. */
  | {
      readonly kind: "stale"
      readonly move: string
      readonly there: There | null
    }

/**
 * How home answered `move`, from owed; a move never goes back to owed. A
 * move home didn't keep takes with it each later owed move of the same take
 * made from where it would have put the take (its `to`, and the next move
 * number), and so on along that chain; any other owed move stays owed. A
 * stale answer that finds home just where the move would have put the take
 * takes nothing with it; a refused or off one can't know where home stands,
 * so its chain goes with it.
 */
function answered(
  state: ConveyorState,
  move: string,
  home: Exclude<MoveHome, "owed">,
  there: There | null = null
): ConveyorState {
  const at = state.moves.findIndex(
    (kept) => kept.move === move && kept.home === "owed"
  )
  if (at === -1) return state
  // Home stands where the move would have put the take (another device made
  // the same move): what was made from there still fits home.
  const arrived =
    there !== null &&
    there.station === state.moves[at].to &&
    there.seq === state.moves[at].seq + 1
  let after = home === "held" || arrived ? null : state.moves[at]
  return {
    moves: state.moves.map((kept, index) => {
      if (index === at) {
        return there === null ? { ...kept, home } : { ...kept, home, there }
      }
      const chained =
        after !== null &&
        index > at &&
        kept.home === "owed" &&
        kept.take === after.take &&
        kept.from === after.to &&
        kept.seq === after.seq + 1
      if (!chained) return kept
      after = kept
      return { ...kept, home: "chained" }
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
    case "refused":
    case "off": {
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
  /** Home's newest move number of it: 0 for none, absent before it. */
  readonly stationSeq?: number | null | undefined
}

/** What home says of a take, read as stations this phone knows. */
export const homeStationOf = (take: {
  readonly station?: string | null | undefined
  readonly stationAt?: string | null | undefined
  readonly stationSeq?: number | null | undefined
}): HomeStation => ({
  station:
    take.station === null
      ? null
      : isTakeStation(take.station)
        ? take.station
        : undefined,
  stationAt: take.stationAt,
  stationSeq: take.stationSeq,
})

/** The labels typed, with commas between; none typed keeps the take's. */
export function labelsOf(typed: string): ReadonlyArray<string> | null {
  const labels = typed.split(",").map((label) => label.trim())
  return labels.some(Boolean) ? labels : null
}

/** Why the phone's latest move of a take didn't reach home. */
type Missed = {
  readonly to: TakeStation
  readonly why: "refused" | "stale" | "off"
}

/** Where a take stands, and whether home has heard of it yet. */
export type TakeStanding = {
  readonly station: TakeStation
  /** When it was moved there; null for a take never moved or not known. */
  readonly at: string | null
  /** Its newest move number, as the next move names it (0 for none). */
  readonly seq: number
  /** Moved on this phone, and home hasn't kept that move yet. */
  readonly going: boolean
  /**
   * The phone's latest move of it that home didn't keep (not counting
   * those dropped with an earlier one), while home is no further on; else
   * null.
   */
  readonly missed: Missed | null
}

/**
 * Where take `id` stands, by move number, never by a clock. The phone's
 * latest kept-or-owed move counts while it is ahead of home's newest
 * (`seq + 1 > stationSeq`); else home's word does. A move after it that
 * home didn't keep is said (`missed`, the first of them) while home is no
 * further on than that move found it, and a stale one shows where home said
 * the take was. Null for a take on no conveyor, and for one home says
 * nothing of (a home before the conveyor) that the phone never moved.
 */
export function stationOf(
  id: string,
  home: HomeStation,
  state: ConveyorState
): TakeStanding | null {
  if (home.station === null) return null
  const homeAt = home.stationAt ?? null
  const homeSeq = home.stationSeq ?? 0
  const mine = state.moves.filter((kept) => kept.take === id)
  // A stale move whose take home already put where it was going (another
  // device made the same move) stands as taken, and isn't one missed.
  const landed = (kept: KeptMove): boolean =>
    kept.there?.station === kept.to && kept.there.seq === kept.seq + 1
  const lastTaken = mine.reduce(
    (last, kept, index) =>
      kept.home === "owed" || kept.home === "held" || landed(kept)
        ? index
        : last,
    -1
  )
  // The latest by when this phone made it, which is also by number: each
  // move is made from the number the one before it showed.
  const taken = lastTaken === -1 ? undefined : mine[lastTaken]
  // How far home may be and still be the place an unkept move found.
  const upTo = (kept: KeptMove): number => kept.there?.seq ?? kept.seq
  // The latest the owner missed: a move dropped with an earlier one is said
  // through that one, so the head of a refused chain is the one named.
  const unkept = mine
    .slice(lastTaken + 1)
    .filter(
      (kept) =>
        kept.home !== "chained" && !landed(kept) && homeSeq <= upTo(kept)
    )
    .at(-1)
  const missed: Missed | null =
    unkept === undefined
      ? null
      : {
          to: unkept.to,
          why:
            unkept.home === "stale" || unkept.home === "off"
              ? unkept.home
              : "refused",
        }
  const there = unkept?.there
  if (there !== undefined) {
    // When home's word is that station, it says since when.
    const at =
      there.station === home.station && there.seq === homeSeq ? homeAt : null
    return { station: there.station, at, seq: there.seq, going: false, missed }
  }
  if (taken !== undefined && taken.seq + 1 > homeSeq) {
    return {
      station: taken.to,
      // Another device's move: when it was made there is home's to say.
      at: landed(taken) ? null : taken.at,
      seq: taken.seq + 1,
      going: taken.home === "owed",
      missed,
    }
  }
  // A home before the conveyor, or a station this phone doesn't know yet
  // (home has moves of it: `stationSeq` past 0), says nothing it can show.
  if (home.station === undefined && (mine.length === 0 || homeSeq > 0)) {
    return null
  }
  return {
    station: home.station ?? FIRST_STATION,
    at: homeAt,
    seq: homeSeq,
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
  /** The take's newest move number as the owner saw it (`TakeStanding`). */
  readonly seq: number
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
      seq: asked.seq,
      labels,
      comment: comment === "" ? null : comment,
    },
  }
}

const isStrings = (value: unknown): value is Array<string> =>
  Array.isArray(value) && value.every((item) => typeof item === "string")

const HOMES: ReadonlyArray<MoveHome> = [
  "owed",
  "held",
  "refused",
  "stale",
  "off",
  "chained",
]

/** A time as `toISOString` writes it, the only kind a move is made with. */
function isInstant(at: string): boolean {
  const ms = Date.parse(at)
  return !Number.isNaN(ms) && new Date(ms).toISOString() === at
}

const isThere = (value: unknown): value is There =>
  isRecord(value) &&
  isTakeStation(value.station) &&
  typeof value.seq === "number" &&
  Number.isInteger(value.seq)

function isKeptMove(kept: unknown): kept is KeptMove {
  return (
    isRecord(kept) &&
    typeof kept.move === "string" &&
    typeof kept.take === "string" &&
    isTakeStation(kept.from) &&
    isTakeStation(kept.to) &&
    typeof kept.at === "string" &&
    isInstant(kept.at) &&
    typeof kept.seq === "number" &&
    Number.isInteger(kept.seq) &&
    kept.seq >= 0 &&
    (kept.labels === null || isStrings(kept.labels)) &&
    (kept.comment === null || typeof kept.comment === "string") &&
    HOMES.some((home) => home === kept.home) &&
    (kept.there === undefined || isThere(kept.there))
  )
}

/** The record as storage keeps it, or null for one this can't read. */
export function parseConveyor(value: unknown): ConveyorState | null {
  if (!isRecord(value)) return null
  const { moves } = value
  if (!Array.isArray(moves) || !moves.every(isKeptMove)) return null
  return { moves }
}
