import type { JSX } from "react"
import { counted } from "@some-ui/core-utils"
import { Badge, Button, useConfirmSheet } from "@some-ui/shared"
import { Trash2 } from "lucide-react"

import { useMinuteClock } from "@/lib/clock"
import { bySession, describeAge, inView } from "@/lib/session-reflection"
import type { Reflection } from "@/lib/session-reflection"
import { useReflections } from "@/lib/session-reflection/use-reflections"
import { useSessions } from "@/lib/tenant"

import { letGo } from "./let-go"

/**
 * Every session holding reflections, the longest-waiting first, each to share
 * (on the phone) or let go: what makes room once all the slots are taken.
 */
export const HandOff = (): JSX.Element | null => {
  const { kept } = useReflections()
  const now = useMinuteClock().getTime()
  const { data: sessions } = useSessions()
  const { ask, sheet } = useConfirmSheet()
  const groups = bySession(kept, now)
  if (groups.length === 0) return null

  // The phone asks in a sheet; the desktop web keeps the browser's dialog
  // (CLAUDE.md, "The phone and the desktop web are separate surfaces").
  const confirmLetGo = (
    name: string,
    reflections: ReadonlyArray<Reflection>
  ): void => {
    const ids = reflections.map((r) => r.id)
    const aside = reflections.length - reflections.filter(inView).length
    // Spoken ones recorded again or set aside go too: the sheet says so.
    const including =
      aside === 0
        ? ""
        : `, including ${String(aside)} set aside or recorded again`
    const what = `${counted(ids.length, "reflection")}${including} from "${name}"`
    if (import.meta.env.VITE_DEVICE_BACKEND !== "true") {
      if (
        confirm(
          `Let go of ${what}? They won't be shared, and can't be brought back.`
        )
      )
        letGo(ids)
      return
    }
    ask({
      title: `Let go of ${counted(ids.length, "reflection")}?`,
      description: `From "${name}"${including}. They won't be shared, and can't be brought back.`,
      confirm: "Let go",
      onConfirm: () => letGo(ids),
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-sm">Oldest first</p>
      <ul className="flex flex-col gap-2">
        {groups.map((group) => {
          const name =
            sessions?.find((s) => s.id === group.sessionId)?.name ??
            "A deleted session"
          return (
            <li
              key={group.sessionId}
              className="flex items-center gap-2 rounded-lg border px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{name}</p>
                <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                  {counted(
                    group.reflections.filter(inView).length,
                    "reflection"
                  )}{" "}
                  · {describeAge(group.oldestMs)} old
                  {group.stale && <Badge variant="secondary">stale</Badge>}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="text-destructive hover:text-destructive"
                aria-label={`Let go of the reflections from "${name}"`}
                onClick={() => confirmLetGo(name, group.reflections)}
              >
                <Trash2 className="mr-1.5 size-3.5" aria-hidden />
                Let go
              </Button>
            </li>
          )
        })}
      </ul>
      {sheet}
    </div>
  )
}
