/**
 * The asks (`docs/asks.md`): the open `ask` issues of both repositories,
 * read each time the desktop web's Asks page opens and on Try again
 * (`./read`), and kept for a minute. Filing an issue is how a new ask
 * reaches the page, and closing it is how it leaves: nothing else is kept
 * or sent. What the owner does on the page is `./receipt`'s.
 */
import { queryOptions } from "@tanstack/react-query"

import { readOpenAsks } from "./read"

export type { OpenAsk } from "./model"
export { questionOf } from "./model"

export const openAsksQuery = queryOptions({
  queryKey: ["asks"],
  queryFn: readOpenAsks,
  staleTime: 60_000,
  retry: false,
})
