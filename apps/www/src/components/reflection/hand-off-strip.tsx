import type { JSX } from "react"
import { useState } from "react"
import { cn } from "@some-ui/core-utils"
import {
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@some-ui/shared"

import { useMinuteClock } from "@/lib/clock"
import {
  bySession,
  describeAge,
  isStale,
  REFLECTION_LIMIT,
} from "@/lib/session-reflection"
import { useReflections } from "@/lib/session-reflection/use-reflections"

import { HandOff } from "./hand-off"

/**
 * The study list's "To hand off": how many of the slots are taken, how long
 * the oldest has waited, and the way to share or let them go. Absent with
 * nothing kept. One bar segment per slot, so a full phone reads as full.
 */
export const HandOffStrip = (): JSX.Element | null => {
  const [open, setOpen] = useState(false)
  const { kept } = useReflections()
  const now = useMinuteClock().getTime()
  if (kept.length === 0) return null

  const oldest = bySession(kept, now)[0]?.oldestMs ?? 0
  const stale = kept.filter((r) => isStale(r, now)).length
  const slots = Array.from({ length: REFLECTION_LIMIT }, (_, i) =>
    i < stale ? "stale" : i < kept.length ? "kept" : "free"
  )

  return (
    <section
      aria-label="Reflections to hand off"
      className="bg-primary/5 border-primary/20 flex flex-col gap-2 rounded-xl border p-3"
    >
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">To hand off</p>
          <p className="text-muted-foreground text-sm">
            {kept.length} of {REFLECTION_LIMIT} slots · oldest{" "}
            {describeAge(oldest)}
          </p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          {import.meta.env.VITE_DEVICE_BACKEND === "true"
            ? "Share or let go"
            : "Let go"}
        </Button>
      </div>
      <div aria-hidden className="flex gap-0.5">
        {slots.map((slot, i) => (
          <span
            // eslint-disable-next-line react/no-array-index-key -- a slot is its position
            key={i}
            className={cn(
              "h-1.5 min-w-0 flex-1 rounded-sm",
              slot === "stale" && "bg-warning",
              slot === "kept" && "bg-primary",
              slot === "free" && "bg-muted"
            )}
          />
        ))}
      </div>
      <p className="text-muted-foreground text-xs">
        Reflections are for your next session, not an archive.{" "}
        {import.meta.env.VITE_DEVICE_BACKEND === "true"
          ? "Share them to Drive for your agent, or let them go."
          : "Let them go once you've acted on them."}
      </p>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          data-scroll-intent="reflections"
          className={
            // scroll-intent: reflections — a session's list of them, or the
            // hand-off list, can outgrow a phone held sideways; the sheet
            // scrolls rather than clipping a Let go button.
            "max-h-[90dvh] gap-0 overflow-y-auto pb-[max(1.5rem,env(safe-area-inset-bottom))]"
          }
        >
          <SheetHeader className="px-0 text-left">
            <SheetTitle>To hand off</SheetTitle>
            <SheetDescription>
              {kept.length} of {REFLECTION_LIMIT} slots taken
              {stale > 0 ? `, ${stale} stale` : ""}.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4">{open && <HandOff />}</div>
        </SheetContent>
      </Sheet>
    </section>
  )
}
