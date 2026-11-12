/**
 * Studio › Renders (SFEED13, #2761): the query that reads home's render jobs,
 * and what the screen says of them. The read is `./read`, over the ask in
 * `lib/home-link/renders`; the answer's shape is `./model`; the words are
 * `./words`.
 */
import { queryOptions } from "@tanstack/react-query"

import { underWay, WHILE_UNDER_WAY_MS } from "./model"
import { readRenders } from "./read"

export * from "./model"
export * from "./subject"
export type { RendersOutcome } from "./read"
export * from "./words"

export const rendersQuery = queryOptions({
  queryKey: ["home", "renders"],
  queryFn: readRenders,
  staleTime: 15_000,
  retry: false,
  // Again on its own while home has something under way, never otherwise.
  refetchInterval: (query): number | false =>
    query.state.data?.kind === "read" && underWay(query.state.data.board)
      ? WHILE_UNDER_WAY_MS
      : false,
})
