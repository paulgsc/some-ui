/**
 * Settings' choice to show, in Korean, the word sets and dramas the
 * reflections routine left on the paired home (LA12,
 * docs/learner-data-authority.md): two presses to show them, the second
 * keeping the words the first showed, and two to stop. Its words are
 * `lib/home-link/words`'s alone; it sends nothing. A choice made before its
 * words told home which lessons were opened says so, and how to choose that. Korean's own list reads
 * home (`components/player/device-routine-files.ts`).
 */
import type { JSX } from "react"
import { useState, useSyncExternalStore } from "react"
import { Button } from "@some-ui/shared"

import { hostOf, useHomeLink } from "@/lib/home-link"
import { routineReads } from "@/lib/home-link/routine"
import { shownNow } from "@/lib/home-link/routine-model"
import { fullDay, lastLook, ROUTINE_READS } from "@/lib/home-link/words"

export const DeviceRoutineReads = (): JSX.Element | null => {
  const { link } = useHomeLink()
  const reads = routineReads()
  const { log, read } = useSyncExternalStore(reads.subscribe, reads.getSnapshot)
  const [asking, setAsking] = useState<"show" | "stop" | null>(null)
  const [refused, setRefused] = useState(false)
  if (link.kind !== "paired") return null
  const host = hostOf(link.base)
  const since = shownNow(log, link.id)
  const choose = (kind: "shown" | "hidden", said: string): void => {
    setAsking(null)
    setRefused(!reads.choose(kind, said))
  }

  return (
    <section className="space-y-2" aria-labelledby="routine-reads-heading">
      <p id="routine-reads-heading" className="text-sm font-medium">
        {ROUTINE_READS.title}
      </p>
      {since === null ? (
        <p className="text-muted-foreground text-xs">{ROUTINE_READS.off}</p>
      ) : (
        <div className="space-y-0.5">
          <p className="text-muted-foreground text-xs">
            {ROUTINE_READS.on(fullDay(since))}
          </p>
          <p className="text-muted-foreground text-xs">{lastLook(read.last)}</p>
          {!reads.tells() && (
            <p className="text-muted-foreground text-xs">
              {ROUTINE_READS.askAgain}
            </p>
          )}
        </div>
      )}
      {refused ? (
        <p className="text-destructive text-xs" role="status">
          {ROUTINE_READS.refused}
        </p>
      ) : null}
      {asking === "show" && since === null ? (
        <div className="space-y-2 rounded-md border p-3">
          <p className="text-sm break-words">{ROUTINE_READS.confirm(host)}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => choose("shown", ROUTINE_READS.confirm(host))}
            >
              {ROUTINE_READS.confirmYes}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setAsking(null)}
            >
              {ROUTINE_READS.confirmNo}
            </Button>
          </div>
        </div>
      ) : asking === "stop" && since !== null ? (
        <div className="space-y-2 rounded-md border p-3">
          <p className="text-sm">{ROUTINE_READS.stopQuestion}</p>
          <p className="text-muted-foreground text-xs">
            {ROUTINE_READS.stopMore}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() =>
                choose(
                  "hidden",
                  `${ROUTINE_READS.stopQuestion} ${ROUTINE_READS.stopMore}`
                )
              }
            >
              {ROUTINE_READS.stopYes}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setAsking(null)}
            >
              {ROUTINE_READS.stopNo}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setRefused(false)
            setAsking(since === null ? "show" : "stop")
          }}
        >
          {since === null ? ROUTINE_READS.show : ROUTINE_READS.stop}
        </Button>
      )}
    </section>
  )
}
