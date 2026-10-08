import type { JSX } from "react"
import type { Side } from "@some-ui/aph"
import { AphLog } from "@some-ui/aph"
import { dayOf } from "@some-ui/core-utils"
import { createFileRoute, useNavigate } from "@tanstack/react-router"

import { useMinuteClock } from "@/lib/clock"

/**
 * `?side=theirs` opens the logger on their figure, and `?entry=` names the
 * entry it is for, which is how History's "Enter their figure" arrives.
 * `?day=` opens mine on a day I missed, which is how History's "not logged"
 * arrives.
 */
type LogSearch = { side?: Side; entry?: string; day?: string }

const LogRoute = (): JSX.Element => {
  const { side, entry, day } = readSearch(Route.useSearch())
  const navigate = useNavigate()
  const now = useMinuteClock()

  return (
    <AphLog
      now={now}
      // A new arrival (another entry, the other side) is a fresh form.
      key={`${side ?? "mine"}:${entry ?? ""}:${day ?? ""}`}
      initialSide={side}
      initialTarget={entry ?? null}
      initialDay={day ?? null}
      onSaved={(saved, savedSide) =>
        // By what was saved, not what was asked for: the form can switch.
        // Mine for today came from Home's "due" card; theirs, and a day I
        // missed, mostly from History, where it now shows.
        void navigate({
          to:
            savedSide === "theirs" || saved.day !== dayOf(now)
              ? "/aph/history"
              : "/today",
        })
      }
    />
  )
}

/**
 * The search as the route validated it. Takes `unknown`: www declares no
 * router `Register`, so `useSearch` is untyped and this is where it is
 * narrowed.
 */
function readSearch(search: unknown): LogSearch {
  return typeof search === "object" && search !== null
    ? validateSearch(Object.fromEntries(Object.entries(search)))
    : {}
}

function validateSearch(search: Record<string, unknown>): LogSearch {
  return {
    ...(search.side === "mine" || search.side === "theirs"
      ? { side: search.side }
      : {}),
    ...(typeof search.entry === "string" ? { entry: search.entry } : {}),
    ...(typeof search.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(search.day)
      ? { day: search.day }
      : {}),
  }
}

export const Route = createFileRoute("/_dashboard/_apk/aph/")({
  validateSearch,
  component: LogRoute,
})
