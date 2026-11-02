import type { JSX } from "react"
import { useState } from "react"
import { Button } from "@some-ui/shared"

import { useMinuteClock } from "@/lib/clock"
import {
  bySession,
  describeAge,
  OFFLINE_SET_WORDS,
  staleCount,
} from "@/lib/session-reflection"
import { useReflections } from "@/lib/session-reflection/use-reflections"

import { HandOff } from "./hand-off"
import { ReflectionSheet } from "./reflection-sheet"

/**
 * The study list's reflections: how many are kept, how long the oldest has
 * waited, and the way to let them go. Absent with nothing kept.
 */
export const HandOffStrip = (): JSX.Element | null => {
  const [open, setOpen] = useState(false)
  const { kept } = useReflections()
  const now = useMinuteClock().getTime()
  if (kept.length === 0) return null

  const oldest = bySession(kept, now)[0]?.oldestMs ?? 0
  const stale = staleCount(kept, now)
  const counts = `${kept.length} kept${stale > 0 ? `, ${stale} stale` : ""}`

  return (
    <section
      aria-label="Your reflections"
      className="bg-primary/5 border-primary/20 flex flex-col gap-2 rounded-xl border p-3"
    >
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Reflections</p>
          <p className="text-muted-foreground text-sm">
            {counts} · oldest {describeAge(oldest)}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          Let go
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        {import.meta.env.VITE_DEVICE_BACKEND === "true"
          ? `Written ones go to home while this phone is paired with it, and the morning routine reads them there. ${OFFLINE_SET_WORDS}`
          : "Kept in this browser. Let them go once you've acted on them."}
      </p>

      <ReflectionSheet
        open={open}
        onOpenChange={setOpen}
        title="Reflections"
        description={`${counts}.`}
      >
        <HandOff />
      </ReflectionSheet>
    </section>
  )
}
