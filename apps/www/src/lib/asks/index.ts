/**
 * The asks (`docs/asks.md`): the `ask` issues of both repositories, open
 * and lately closed, read each time the desktop web's Asks page opens and
 * on Try again (`./read`), and kept for a minute. Filing an issue is how a
 * new ask reaches the page, and closing it is how it is answered: nothing
 * else is kept or sent. What the owner does on the page is `./receipt`'s.
 */
import { queryOptions } from "@tanstack/react-query"

import { readAsks } from "./read"

export type { AskIssue } from "./model"
export { questionOf } from "./model"

export const asksQuery = queryOptions({
  queryKey: ["asks"],
  queryFn: readAsks,
  staleTime: 60_000,
  retry: false,
})
