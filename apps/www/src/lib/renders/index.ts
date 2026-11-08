/**
 * Studio › Renders (SFEED13, #2761): the query that reads home's render jobs,
 * and what the screen says of them. The read is `lib/home-link/renders`; the
 * answer's shape is `./model`; the words are `./words`.
 */
import { queryOptions } from "@tanstack/react-query"

import { askRenders } from "@/lib/home-link/renders"

import type { BoardRead } from "./model"
import { readBoard, rendering, WHILE_RENDERING_MS } from "./model"

export * from "./model"
export * from "./words"

/** What reading home came to: its board, or why there is none. */
export type RendersOutcome =
  | BoardRead
  | { readonly kind: "unpaired" }
  | { readonly kind: "away" }

/** Reads home's render jobs once; never rejects. */
export async function readRenders(): Promise<RendersOutcome> {
  const asked = await askRenders()
  switch (asked.kind) {
    case "answered":
      return readBoard(asked.answer)
    case "unpaired":
      return { kind: "unpaired" }
    case "busy":
    case "unreachable":
      return { kind: "away" }
  }
}

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
