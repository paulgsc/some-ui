/**
 * The sessions home holds, as the Home server block read them on a tap:
 * searched by name, filtered by finished or not, newest first, shown a page
 * at a time as the list scrolls. Everything here works on the list in hand;
 * scrolling, searching and filtering send nothing (LA8), and only the
 * block's own button reads home again.
 *
 * Phone-only (`build.paths.ts`, `device-*.tsx`).
 */
import type { JSX } from "react"
import { useEffect, useEffectEvent, useState } from "react"
import { formatTimecode } from "@some-ui/core-utils"
import { Badge, Button, Input, Label } from "@some-ui/shared"

import type { SessionFilter } from "@/lib/tenant/session-search"
import { lastMoved, searchSessions } from "@/lib/tenant/session-search"
import type { SessionRecord } from "@/lib/tenant/types"

/** How many more rows each reach of the list's end shows. */
export const PAGE = 20

const FILTERS: ReadonlyArray<{ value: SessionFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "finished", label: "Finished" },
  { value: "unfinished", label: "Not finished" },
]

const STATUS: Record<SessionRecord["status"], string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  active: "In progress",
  paused: "Paused",
  completed: "Finished",
}

const Row = ({ session }: { session: SessionRecord }): JSX.Element => {
  const length = session.finalElapsedMs ?? session.totalDurationMs
  return (
    <li className="flex items-start justify-between gap-2 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm">{session.name}</p>
        <p className="text-muted-foreground text-xs">
          {new Date(lastMoved(session)).toLocaleDateString()} ·{" "}
          {formatTimecode(length)}
        </p>
      </div>
      <Badge
        variant={session.status === "completed" ? "secondary" : "outline"}
        className="shrink-0"
      >
        {STATUS[session.status]}
      </Badge>
    </li>
  )
}

/**
 * Calls `onReach` whenever the element it returns scrolls into view: the
 * list's end, asking for the next page. Without `IntersectionObserver` it
 * never calls, and the "Show more" button does the same.
 */
function useReachedEnd(onReach: () => void): (node: Element | null) => void {
  const reach = useEffectEvent(onReach)
  const [node, setNode] = useState<Element | null>(null)
  useEffect(() => {
    if (node === null || typeof IntersectionObserver === "undefined") return
    const observer = new IntersectionObserver((entries): void => {
      if (entries.some((entry) => entry.isIntersecting)) reach()
    })
    observer.observe(node)
    return (): void => observer.disconnect()
  }, [node])
  return setNode
}

export const HomeSessions = ({
  sessions,
  host,
}: {
  sessions: ReadonlyArray<SessionRecord>
  host: string
}): JSX.Element => {
  const [text, setText] = useState("")
  const [filter, setFilter] = useState<SessionFilter>("all")
  const [shown, setShown] = useState(PAGE)
  const found = searchSessions(sessions, { text, filter })
  const more = Math.min(PAGE, found.length - shown)
  const endRef = useReachedEnd(() => {
    if (more > 0) setShown((n) => n + PAGE)
  })

  return (
    <div className="space-y-2 rounded-md border p-3">
      <Label htmlFor="home-sessions-search">
        {sessions.length} session{sessions.length === 1 ? "" : "s"} on {host}
      </Label>
      <Input
        id="home-sessions-search"
        type="search"
        placeholder="Search by name"
        value={text}
        onChange={(event) => {
          setText(event.target.value)
          setShown(PAGE)
        }}
      />
      <div className="flex flex-wrap gap-1" role="group" aria-label="Show">
        {FILTERS.map(({ value, label }) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={filter === value ? "secondary" : "ghost"}
            aria-pressed={filter === value}
            onClick={() => {
              setFilter(value)
              setShown(PAGE)
            }}
          >
            {label}
          </Button>
        ))}
      </div>
      {found.length === 0 ? (
        <p className="text-muted-foreground text-sm" role="status">
          {sessions.length === 0
            ? `${host} holds no sessions yet.`
            : "No session matches."}
        </p>
      ) : (
        <ul className="divide-y" aria-label={`Sessions on ${host}`}>
          {found.slice(0, shown).map((session) => (
            <Row key={session.id} session={session} />
          ))}
        </ul>
      )}
      {more > 0 ? (
        <div ref={endRef}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShown((n) => n + PAGE)}
          >
            Show {more} more
          </Button>
        </div>
      ) : null}
    </div>
  )
}
