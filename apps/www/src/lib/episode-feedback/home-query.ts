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

/** The page's read of home's notes; `moved` is the lane's count of answers. */
export const homeNotesQuery = (
  moved: number
): UseQueryOptions<
  HomeNotesOutcome,
  Error,
  HomeNotesOutcome,
  Array<string | number>
> =>
  queryOptions({
    queryKey: ["home", "episode-notes", moved],
    queryFn: readHomeNotes,
    staleTime: 15_000,
    retry: false,
  })
