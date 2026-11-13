/**
 * Home's record of each move of a Studio take along the conveyor
 * (CONVEYOR1, #2873; paulgsc/server `studio_take_move`):
 * `POST /voice-notes/:id/station`, one per move owed, oldest first, over
 * the voice lane's `send` (`./voice-copy`'s `sendVoice`), so this module
 * makes no request of its own. It sends where the take was moved from and
 * to, when, its labels when they change and a comment, and nothing else of
 * the phone's. Home keeps each move as its own row and never rewrites one.
 * Its answers:
 *
 * - `200` carrying the take back at the station moved to, `moved`, or
 *   `unchanged` for a move it already holds (one sent again): held;
 * - `409`, the take no longer stands where the move was made from: home is
 *   asked once for the take's station and history
 *   (`GET /voice-notes/:id/station`). A move it holds (one kept before,
 *   whose answer this phone never kept, then moved on from) is held; any
 *   other is dropped as stale, with where home says the take is, and said
 *   on the take's row; the phone's later moves of the take go with it
 *   (`lib/take-conveyor`), and are not sent. A read home can't answer
 *   ends the run with the move still owed, and a `401` there as below;
 * - `422`, a move home won't take as it is: refused for good, said to the
 *   native log;
 * - `404`, home holds no such Studio take of this phone's owner, or keeps
 *   no conveyor yet: still owed, with the take's later moves, asked again
 *   on every run, said to the native log once a launch;
 * - `401`: home no longer knows this phone, and the run ends there;
 * - anything else ends the run, each move still owed.
 */
import type { HomeCall, HomeExchanged } from "@some-ui/core-utils"
import { isRecord, jsonOf, unexpectedAnswer } from "@some-ui/core-utils"

import type { StationMove, TakeStation } from "@/lib/take-conveyor/model"
import { isTakeStation } from "@/lib/take-conveyor/model"
import type { StationsPort } from "@/lib/take-conveyor/runtime"

import { untakenTold } from "./keyed-send"

/** The move's request, as home takes it: the take's id in the path. */
export const stationPath = (move: StationMove): string =>
  `/voice-notes/${encodeURIComponent(move.take)}/station`

/** The move's body: from, to, when, and what rides along. */
export const stationBody = (move: StationMove): string =>
  JSON.stringify({
    from: move.from,
    to: move.to,
    at: move.at,
    ...(move.labels === null ? {} : { labels: move.labels }),
    ...(move.comment === null ? {} : { comment: move.comment }),
  })

/** Whether a `200`'s body carries the take back where the move put it. */
function carriesBack(body: string, move: StationMove): boolean {
  const answer = jsonOf(body)
  if (!isRecord(answer) || !isRecord(answer.take)) return false
  return (
    (answer.change === "moved" || answer.change === "unchanged") &&
    answer.take.id === move.take &&
    answer.take.station === move.to
  )
}

/** The same instant, however each writes it. */
const sameAt = (a: unknown, b: string): boolean =>
  typeof a === "string" && new Date(a).getTime() === new Date(b).getTime()

/** What home's read of a take says: where it is, and whether it holds `move`. */
function readStation(
  body: string,
  move: StationMove
): { readonly there: TakeStation | null; readonly holds: boolean } | null {
  const answer = jsonOf(body)
  if (!isRecord(answer) || !Array.isArray(answer.history)) return null
  const holds = answer.history.some(
    (row) =>
      isRecord(row) &&
      row.from === move.from &&
      row.to === move.to &&
      sameAt(row.at, move.at)
  )
  return {
    there: isTakeStation(answer.station) ? answer.station : null,
    holds,
  }
}

/**
 * After a `409`: home's word on the take. Held when its history holds the
 * move; stale, with where the take is, when home reads it back (or holds no
 * such take now); and otherwise the run ends with the move still owed, so
 * the next run asks again, since a `409` repeats.
 */
async function afterConflict(
  move: StationMove,
  send: HomeCall
): Promise<
  | { readonly kind: "held" }
  | { readonly kind: "stale"; readonly there: TakeStation | null }
  | { readonly kind: "ended"; readonly exchanged: HomeExchanged }
> {
  const read = await send("GET", stationPath(move))
  if (read.status === 404) return { kind: "stale", there: null }
  if (read.status === 401) {
    return { kind: "ended", exchanged: { kind: "forgotten" } }
  }
  const station = read.status === 200 ? readStation(read.body, move) : null
  if (station === null) {
    return {
      kind: "ended",
      exchanged: unexpectedAnswer("a read of a Studio take", read.status),
    }
  }
  return station.holds
    ? { kind: "held" }
    : { kind: "stale", there: station.there }
}

/** Home not taking a move, said to the native log. */
const untaken = untakenTold("Studio takes (where each is, to home)", {
  unkept:
    "Home didn't find a take moved on this phone, or keeps no conveyor yet, so the move is sent again next time.",
  refused:
    "Home didn't take a move of a Studio take, so the take shows where it was before.",
})

/** Sends each move owed, oldest first, and says how the exchange ended. */
export async function sendStationMoves(
  port: StationsPort,
  send: HomeCall
): Promise<HomeExchanged> {
  // A take whose move stays owed this run sends none of its later ones,
  // which were made from where that one would have put it.
  const heldBack = new Set<string>()
  for (const move of port.due()) {
    // An earlier answer this run may have settled it (`lib/take-conveyor`).
    const owed = port.due().some((due) => due.move === move.move)
    if (!owed || heldBack.has(move.take)) continue
    const answer = await send("POST", stationPath(move), stationBody(move))
    if (answer.status === 200 && carriesBack(answer.body, move)) {
      port.answered(move.move, { kind: "held" })
      continue
    }
    if (answer.status === 401) return { kind: "forgotten" }
    if (answer.status === 404) {
      heldBack.add(move.take)
      untaken(move.move, 404)
      continue
    }
    if (answer.status === 409) {
      const after = await afterConflict(move, send)
      if (after.kind === "ended") return after.exchanged
      port.answered(move.move, after)
      continue
    }
    if (answer.status === 422) {
      port.answered(move.move, { kind: "refused" })
      untaken(move.move, 422)
      continue
    }
    return unexpectedAnswer("a move of a Studio take", answer.status)
  }
  return { kind: "synced" }
}
