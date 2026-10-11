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
import { NotebookPen } from "lucide-react"

import { formatTimecode } from "@/lib/format"
import { useReflections } from "@/lib/session-reflection/use-reflections"

import { ReflectPanel } from "./reflect-panel"

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
  const count = kept.filter((r) => r.sessionId === sessionId).length

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
            <SheetTitle>What&apos;s on your mind?</SheetTitle>
            <SheetDescription>
              Stamped {formatTimecode(atMs)} into the session. It keeps running.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            {open && <ReflectPanel sessionId={sessionId} atMs={atMs} />}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
