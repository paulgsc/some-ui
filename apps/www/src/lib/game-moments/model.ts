/**
 * What home's answer for a game's moment log comes to (GWB14 D15), and
 * when it is read again. Pure.
 */
import type { HomeAnswer } from "@some-ui/core-utils"
import { jsonOf } from "@some-ui/core-utils"
import type { GameMoments } from "@some-ui/game-week"

import { phoneWasBusy } from "@/lib/phone-busy"

/** What a read of a game's moments came to. */
export type MomentsOutcome =
  | { readonly kind: "read"; readonly log: GameMoments }
  /** Home keeps no log of that game, or is from before it kept one. */
  | { readonly kind: "none" }
  | { readonly kind: "unpaired" }

/**
 * The log's reader, the recorder's own (`@some-ui/game-week`'s
 * `readMoments`), which the route hands in: that workspace is the phone's
 * alone.
 */
export type MomentsReader = (value: unknown) => GameMoments | null

/**
 * Home's answer for `gameId`, read with `read`; null when it can't be read,
 * or is another game's.
 */
export function readGameMoments(
  answer: HomeAnswer,
  gameId: string,
  read: MomentsReader
): MomentsOutcome | null {
  if (answer.status === 404) return { kind: "none" }
  if (answer.status !== 200) return null
  const log = read(jsonOf(answer.body))
  return log?.gameId === gameId ? { kind: "read", log } : null
}

/** How often a game still on is read again, for the moments since. */
export const WHILE_ON_MS = 60_000

/**
 * When a game's moments are read again on their own: every minute while the
 * game is on, or while this phone was busy with home; never once it is over,
 * home keeps none, or home gave no answer (a pull or a visit reads again).
 */
export function momentsAgainIn(state: {
  readonly error: unknown
  readonly data: MomentsOutcome | undefined
}): number | false {
  if (phoneWasBusy(state.error)) return WHILE_ON_MS
  if (state.error !== null && state.error !== undefined) return false
  return state.data?.kind === "read" && !state.data.log.final
    ? WHILE_ON_MS
    : false
}
