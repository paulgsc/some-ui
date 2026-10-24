/**
 * The TanStack Query hook for what the reflections routine left on home
 * (`adapter/routine-files`). Only the handheld calls it.
 */

import type { UseQueryResult } from "@tanstack/react-query"
import { useQuery } from "@tanstack/react-query"
import type {
  RoutineFeed,
  RoutineFile,
} from "@topik/lib/topik/adapter/routine-files"

/** Home's files; idle where the host reaches no home. */
export function useRoutineFiles(
  feed: RoutineFeed | undefined
): UseQueryResult<ReadonlyArray<RoutineFile>> {
  return useQuery({
    // Keyed on whether there is a home, so no answer outlives its host.
    queryKey: ["routine-files", feed !== undefined],
    queryFn: () => (feed ? feed.list() : []),
    enabled: feed !== undefined,
    // A routine answers at most a few times a day; once that is old, coming
    // back to the list asks again (the host's default is never to).
    staleTime: 10 * 60 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    gcTime: 30 * 60 * 1000,
  })
}
