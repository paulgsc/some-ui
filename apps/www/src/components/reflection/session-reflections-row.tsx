import type { JSX } from "react"
import { counted, formatRelativeTime } from "@some-ui/core-utils"
import { Badge } from "@some-ui/shared"
import { Check, NotebookPen } from "lucide-react"

import { useMinuteClock } from "@/lib/clock"
import { bySession, describeAge } from "@/lib/session-reflection"
import { useReflections } from "@/lib/session-reflection/use-reflections"

/**
 * A session card's line about its reflections: how many are kept and how
 * old; or that they were shared; or, for a finished session with neither,
 * that there are none. Nothing for a draft.
 */
export const SessionReflectionsRow = ({
  sessionId,
  finished,
}: {
  sessionId: string
  finished: boolean
}): JSX.Element | null => {
  const { kept, shared } = useReflections()
  const now = useMinuteClock().getTime()
  const group = bySession(
    kept.filter((r) => r.sessionId === sessionId),
    now
  ).at(0)
  const sharedAt = shared.find((m) => m.sessionId === sessionId)?.sharedAt

  if (group) {
    return (
      <div className="bg-primary/5 mt-2 flex items-center gap-2 rounded-lg px-2.5 py-1.5">
        <NotebookPen className="text-primary size-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm">
          {counted(group.reflections.length, "reflection")} ·{" "}
          {describeAge(group.oldestMs)} old
        </span>
        {group.stale && <Badge variant="secondary">stale</Badge>}
      </div>
    )
  }
  if (sharedAt)
    return (
      <p className="text-success mt-2 flex items-center gap-1.5 text-sm">
        <Check className="size-4" aria-hidden />
        Reflections shared {formatRelativeTime(sharedAt)}
      </p>
    )
  if (!finished) return null
  return (
    <p className="text-muted-foreground mt-2 flex items-center gap-1.5 rounded-lg border border-dashed px-2.5 py-1.5 text-sm">
      <NotebookPen className="size-4" aria-hidden />
      No reflections
    </p>
  )
}
