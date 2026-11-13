/**
 * Studio › Renders (SFEED13, #2761): the query that reads home's render jobs,
 * and what the screen says of them. The read is `./read`, over the ask in
 * `lib/home-link/renders`; the answer's shape is `./model`; the words are
 * `./words`.
 */
import { queryOptions } from "@tanstack/react-query"

import { underWay, WHILE_UNDER_WAY_MS } from "./model"
import type { RendersOutcome } from "./read"
import { readRenders } from "./read"

export * from "./model"
export * from "./conveyor"
export * from "./subject"
export type { RendersOutcome } from "./read"
export * from "./words"

/**
 * When the board is read again on its own: every half minute while home has
 * something under way, never otherwise, and not once a read found no answer
 * (away from home, a timed read waits for the screen to open again or a
 * pull; AW1, lib/home-link/away).
 */
export function rendersAgainIn(state: {
  readonly status: string
  readonly data: RendersOutcome | undefined
}): number | false {
  return state.status !== "error" &&
    state.data?.kind === "read" &&
    underWay(state.data.board)
    ? WHILE_UNDER_WAY_MS
    : false
}

export const rendersQuery = queryOptions({
  queryKey: ["home", "renders"],
  queryFn: readRenders,
  staleTime: 15_000,
  retry: false,
  refetchInterval: (query): number | false => rendersAgainIn(query.state),
})
