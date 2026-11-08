/**
 * Studio › Renders (SFEED13, #2761): the query that reads home's render jobs,
 * and what the screen says of them. The read is `lib/home-link/renders`; the
 * answer's shape is `./model`; the words are `./words`.
 */
import { queryOptions } from "@tanstack/react-query"

import { readRenders } from "@/lib/home-link/renders"

import { rendering, WHILE_RENDERING_MS } from "./model"

export type { RendersOutcome } from "@/lib/home-link/renders"
export * from "./model"
export * from "./words"

export const rendersQuery = queryOptions({
  queryKey: ["home", "renders"],
  queryFn: readRenders,
  staleTime: 15_000,
  retry: false,
  // Again on its own while home is making something, never otherwise.
  refetchInterval: (query): number | false =>
    query.state.data?.kind === "read" && rendering(query.state.data.board)
      ? WHILE_RENDERING_MS
      : false,
})
