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
 * - `409`, the take no longer stands where the move was made from (moved
 *   on another device, or picked up): dropped as stale, and the take shows
 *   where home says, with the move that wasn't made;
 * - `422`, a move home won't take as it is: refused for good, said to the
 *   native log;
 * - `404`, home holds no such Studio take of this phone's owner, or keeps
 *   no conveyor yet: still owed, asked again on every run, said to the
 *   native log once a launch;
 * - `401`: home no longer knows this phone, and the run ends there;
 * - anything else ends the run, each move still owed.
 */
import type { HomeCall, HomeExchanged } from "@some-ui/core-utils"
import { isRecord, jsonOf, unexpectedAnswer } from "@some-ui/core-utils"

import type { StationMove } from "@/lib/take-conveyor/model"
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
  for (const move of port.due()) {
    const answer = await send("POST", stationPath(move), stationBody(move))
    if (answer.status === 200 && carriesBack(answer.body, move)) {
      port.answered("held", move.move)
      continue
    }
    if (answer.status === 401) return { kind: "forgotten" }
    if (answer.status === 404) {
      untaken(move.move, 404)
      continue
    }
    if (answer.status === 409) {
      port.answered("stale", move.move)
      continue
    }
    if (answer.status === 422) {
      port.answered("refused", move.move)
      untaken(move.move, 422)
      continue
    }
    return unexpectedAnswer("a move of a Studio take", answer.status)
  }
  return { kind: "synced" }
}
