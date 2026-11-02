import type { JSX } from "react"
import { useEffect, useState } from "react"
import { cn, formatTimecode } from "@some-ui/core-utils"
import { Button } from "@some-ui/shared"
import { NotebookPen } from "lucide-react"

import { inView } from "@/lib/session-reflection"
import { useReflections } from "@/lib/session-reflection/use-reflections"

import { ReflectPanel } from "./reflect-panel"
import { ReflectionSheet } from "./reflection-sheet"

/**
 * "Reflect", always one tap away during a session, with how many this session
 * has so far. Opens the panel in a sheet, and the session waits while it is
 * open (#1870): `hold` pauses it, and closing the sheet, or the sheet going
 * with its player, lets go. Each reflection is stamped with how far into the
 * session it was said, which stays put while the sheet is open.
 */
export const ReflectButton = ({
  sessionId,
  atMs,
  hold,
  className,
}: {
  sessionId: string
  /** How far into the session now. */
  atMs: number
  /**
   * Holds the session still until the returned release: the player's
   * `holdable` (`lib/session-stop/playback`), typed here by shape, since LA7
   * keeps this module's imports to the reflection's own.
   */
  hold: () => () => void
  className?: string
}): JSX.Element => {
  const [open, setOpen] = useState(false)
  // The sheet open is the external hold's lifetime: kept while it is open,
  // let go as it closes or unmounts.
  useEffect(() => (open ? hold() : undefined), [open, hold])
  const { kept } = useReflections()
  // One recorded again or set aside is kept, but not the session's (D2, D3).
  const count = kept.filter(
    (r) => r.sessionId === sessionId && inView(r)
  ).length

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        onClick={() => setOpen(true)}
        aria-label={
          count > 0 ? `Reflect, ${count} so far this session` : "Reflect"
        }
        className={cn("h-9 gap-1.5 rounded-full", className)}
      >
        <NotebookPen className="size-4" aria-hidden />
        Reflect
        {count > 0 && (
          <span
            aria-hidden
            className="bg-primary text-primary-foreground flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-bold"
          >
            {count}
          </span>
        )}
      </Button>
      <ReflectionSheet
        open={open}
        onOpenChange={setOpen}
        title="What's on your mind?"
        description={`Stamped ${formatTimecode(atMs)} into the session. It waits until you close this.`}
      >
        <ReflectPanel sessionId={sessionId} atMs={atMs} />
      </ReflectionSheet>
    </>
  )
}
