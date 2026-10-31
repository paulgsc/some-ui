/**
 * Korean's way to what the reflections routine left on the paired home, in
 * the Android app (LA15, docs/learner-data-authority.md): a port only while
 * the phone is paired, keyed by the pairing, so a new pairing starts with
 * nothing listed. Phone-only (`build.paths.ts`); `session-viewport.tsx`
 * reaches it only in the device build.
 */
import { useMemo } from "react"

import { useHomeLink } from "@/lib/home-link"
import { routineReads } from "@/lib/home-link/routine"

/** As `@some-ui/topik`'s `RoutineFilesPort`, which this is handed as. */
type RoutineFilesPort = {
  /** Which pairing the answers are for. */
  key: string
  list: () => Promise<unknown>
  /** Tells home which were opened, so the routine keeps three ready. */
  opened: (keys: ReadonlyArray<string>) => void
}

export function useHomeRoutineFiles(): RoutineFilesPort | undefined {
  const { link } = useHomeLink()
  const reads = routineReads()
  const key = link.kind === "paired" ? link.id : null
  return useMemo(
    () =>
      key === null
        ? undefined
        : {
            key,
            list: () => reads.list(),
            opened: (keys: ReadonlyArray<string>): void =>
              reads.tellOpened(keys),
          },
    [key, reads]
  )
}
