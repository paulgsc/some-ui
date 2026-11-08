/**
 * Studio's Feedback page's query of the notes home keeps (SFEED6, #2745),
 * over `./home-read`.
 */
import type { UseQueryOptions } from "@tanstack/react-query"
import { queryOptions } from "@tanstack/react-query"

import type { HomeNotesOutcome } from "./home-read"
import { readHomeNotes } from "./home-read"

export type { HomeNotesOutcome } from "./home-read"
export { episodeNotesMoved, notesAnswered } from "./home-read"

/**
 * The page's read of home's notes, each time it opens and on a drag down. A note
 * home reads back while the page is open shows as on home at once, from the
 * lane's answer (`notesAnswered`); when since is the next read's.
 */
export const homeNotesQuery: UseQueryOptions<
  HomeNotesOutcome,
  Error,
  HomeNotesOutcome,
  Array<string>
> = queryOptions({
  queryKey: ["home", "episode-notes"],
  queryFn: ({ signal }) => readHomeNotes(() => !signal.aborted),
  staleTime: 15_000,
  // The app reads nothing again on mount by default: opening the page is
  // this read's moment, as Studio's feed videos' is.
  refetchOnMount: "always",
  retry: false,
})
