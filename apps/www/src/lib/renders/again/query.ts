/**
 * The takes needing attention, as Run it again reads them (RETRY): one read
 * of Needs your attention's list each time the page opens, after each tap,
 * and on Try again, kept apart from the page that acts on them. Phone-only.
 */
import { queryOptions } from "@tanstack/react-query"

import { readAttentionIds } from "./ask"

export const againAttentionQuery = queryOptions({
  queryKey: ["home", "attention", "ids"],
  queryFn: readAttentionIds,
  staleTime: 15_000,
  retry: false,
})
