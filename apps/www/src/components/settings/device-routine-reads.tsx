/**
 * Settings' readout of Korean's look at the word sets and dramas the
 * reflections routine leaves on the paired home (LA15,
 * docs/learner-data-authority.md): what Korean lists from home, and how the
 * last look went. Its words are `lib/home-link/words`'s alone; it sends
 * nothing. Korean's own list reads home
 * (`components/player/device-routine-files.ts`). The status page's row for
 * that look comes from here too (`useLookRow`): LA8 lets only the modules
 * on its allowlist read the home link, and this is one.
 */
import type { JSX } from "react"
import { useSyncExternalStore } from "react"

import { useHomeLink } from "@/lib/home-link"
import { routineReads } from "@/lib/home-link/routine"
import { lastLook, ROUTINE_LOOK } from "@/lib/home-link/words"
import type { BoardRow } from "@/lib/status-board"
import { lookOf } from "@/lib/status-board"
import { LOOK_WORDS } from "@/lib/status-board/words"

/**
 * Korean's look at the routine's files on home, as the status page shows
 * it (#2165): not yet, or how the last look went. None while the phone
 * isn't paired, since there is no home to look at.
 */
export function useLookRow(): BoardRow | null {
  const { link } = useHomeLink()
  const reads = routineReads()
  const read = useSyncExternalStore(reads.subscribe, reads.getSnapshot)
  if (link.kind !== "paired") return null
  const look = lookOf(read.last)
  return {
    id: "korean-look",
    group: "korean",
    name: LOOK_WORDS.name,
    word: LOOK_WORDS.words[look],
    line: lastLook(read.last),
    more: [],
    mark: { kind: "look", look },
    page: "home-settings",
  }
}

export const DeviceRoutineReads = (): JSX.Element | null => {
  const { link } = useHomeLink()
  const reads = routineReads()
  const read = useSyncExternalStore(reads.subscribe, reads.getSnapshot)
  if (link.kind !== "paired") return null
  return (
    <section className="space-y-1" aria-labelledby="routine-reads-heading">
      <p id="routine-reads-heading" className="text-sm font-medium">
        {ROUTINE_LOOK.title}
      </p>
      <p className="text-muted-foreground text-xs">{ROUTINE_LOOK.lead}</p>
      <p className="text-muted-foreground text-xs" role="status">
        {lastLook(read.last)}
      </p>
    </section>
  )
}
