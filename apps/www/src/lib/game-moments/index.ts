/**
 * A game's moment log, as Takes filtered to that game reads it (GWB14 D15,
 * #3039): one query per game, keyed by its id, so an answer for one game
 * never stands for another's (nor does one whose `gameId` differs), and read again each minute while the game is
 * on (`./model`). The read is `./read`, over `lib/home-link/game-moments`.
 * What it shows is the big moments no bite was said about, among the bites
 * (`@some-ui/game-week`'s `momentsWithNoBite`). Phone-only
 * (`build.paths.ts`).
 */
import { queryOptions } from "@tanstack/react-query"

import type { MomentsOutcome, MomentsReader } from "./model"
import { momentsAgainIn } from "./model"
import { readMomentsOf } from "./read"

type MomentsQueryOptions = ReturnType<
  typeof queryOptions<
    MomentsOutcome,
    Error,
    MomentsOutcome,
    readonly ["home", "game-moments", string]
  >
>

/** The read of `gameId`'s moments, with the route's reader. */
export function gameMomentsQuery(
  gameId: string,
  reader: MomentsReader
): MomentsQueryOptions {
  return queryOptions({
    queryKey: ["home", "game-moments", gameId] as const,
    queryFn: () => readMomentsOf(gameId, reader),
    staleTime: 15_000,
    retry: false,
    refetchInterval: (query): number | false => momentsAgainIn(query.state),
  })
}
