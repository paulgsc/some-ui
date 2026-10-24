/**
 * Korean's way to what the reflections routine left on the paired home, in
 * the Android app (LA12, docs/learner-data-authority.md): a port only while
 * the phone is paired and its person chose to show them there, keyed by
 * that choice, so a new pairing, or a stop and a new choice, starts with
 * nothing listed. Phone-only (`build.paths.ts`); `session-viewport.tsx`
 * reaches it only in the device build.
 */
import { useMemo, useSyncExternalStore } from "react"

import { useHomeLink } from "@/lib/home-link"
import { routineReads } from "@/lib/home-link/routine"
import { underNow } from "@/lib/home-link/routine-model"

/** As `@some-ui/topik`'s `RoutineFilesPort`, which this is handed as. */
type RoutineFilesPort = {
  /** Which choice the answers are for. */
  key: string
  list: () => Promise<unknown>
}

export function useHomeRoutineFiles(): RoutineFilesPort | undefined {
  const { link } = useHomeLink()
  const reads = routineReads()
  const { log } = useSyncExternalStore(reads.subscribe, reads.getSnapshot)
  const under = underNow(log, link.kind === "paired" ? link.id : null)
  const key = under === null ? null : `${under.pairing}@${under.since}`
  return useMemo(
    () => (key === null ? undefined : { key, list: () => reads.list() }),
    [key, reads]
  )
}
