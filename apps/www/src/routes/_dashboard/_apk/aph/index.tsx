import type { JSX } from "react"
import type { Side } from "@some-ui/aph"
import { AphLog } from "@some-ui/aph"
import { createFileRoute, useNavigate } from "@tanstack/react-router"

/**
 * `?side=theirs` opens the logger on their figure, and `?entry=` names the
 * entry it is for, which is how History's "Enter their figure" arrives.
 */
type LogSearch = { side?: Side; entry?: string }

const LogRoute = (): JSX.Element => {
  const { side, entry } = readSearch(Route.useSearch())
  const navigate = useNavigate()

  return (
    <AphLog
      // A new arrival (another entry, the other side) is a fresh form.
      key={`${side ?? "mine"}:${entry ?? ""}`}
      side={side}
      target={entry ?? null}
      onSaved={() =>
        // Mine came from Home's "due" card; theirs mostly from History.
        void navigate({ to: side === "theirs" ? "/aph/history" : "/today" })
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
  }
}

export const Route = createFileRoute("/_dashboard/_apk/aph/")({
  validateSearch,
  component: LogRoute,
})
