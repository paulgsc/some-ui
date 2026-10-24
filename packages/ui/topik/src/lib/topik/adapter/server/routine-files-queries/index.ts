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
    // Keyed on which home, or whether there is one, so no answer outlives
    // its host.
    queryKey: ["routine-files", feed?.key ?? feed !== undefined],
    queryFn: () => (feed ? feed.list() : []),
    enabled: feed !== undefined,
    // Asked on the lesson opening and the app coming back to the front, and
    // at no other moment: never on an interval, a reconnect or a retry
    // (LA12). Each is one look, so nothing a look missed waits out a window.
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: false,
    retry: false,
    gcTime: 30 * 60 * 1000,
  })
}
