/**
 * Studio's asks (SFEED1, #2731): the open `ask` issues of both repositories,
 * read each time the Asks page opens and on Try again (`./read`), and kept
 * for a minute, so an ask's page opened from the list shows at once. Until
 * answering by voice brings asks home (SFEED5), this is the only way the
 * phone can see them.
 */
import { queryOptions } from "@tanstack/react-query"

import { readStudioAsks } from "./read"

export type { StudioAsk } from "./model"
export { questionOf } from "./model"

export const studioAsksQuery = queryOptions({
  queryKey: ["studio", "asks"],
  queryFn: readStudioAsks,
  staleTime: 60_000,
  retry: false,
})
