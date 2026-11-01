import type { JSX } from "react"
import { useState } from "react"
import { cn, formatTimecode } from "@some-ui/core-utils"
import { Button } from "@some-ui/shared"
import { NotebookPen } from "lucide-react"

import { inView } from "@/lib/session-reflection"
import { useReflections } from "@/lib/session-reflection/use-reflections"

import { ReflectPanel } from "./reflect-panel"
import { ReflectionSheet } from "./reflection-sheet"

/**
 * "Reflect", always one tap away during a session, with how many this session
 * has so far. Opens the panel in a sheet; the session keeps running, and each
 * reflection is stamped with how far into it it was said.
 */
export const ReflectButton = ({
  sessionId,
  atMs,
  className,
}: {
  sessionId: string
  /** How far into the session now. */
  atMs: number
  className?: string
}): JSX.Element => {
  const [open, setOpen] = useState(false)
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
        description={`Stamped ${formatTimecode(atMs)} into the session. It keeps running.`}
      >
        <ReflectPanel sessionId={sessionId} atMs={atMs} />
      </ReflectionSheet>
    </>
  )
}
