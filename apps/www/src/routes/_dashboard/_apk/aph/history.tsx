import type { JSX } from "react"
import { AphHistory } from "@some-ui/aph"
import { createFileRoute, useNavigate } from "@tanstack/react-router"

import { useMinuteClock } from "@/lib/clock"

const HistoryRoute = (): JSX.Element => {
  const navigate = useNavigate()
  // The host's clock: "today" in the list turns over at midnight.
  const now = useMinuteClock()
  return (
    <AphHistory
      now={now}
      onEnterTheirs={(entry) =>
        void navigate({ to: "/aph", search: { side: "theirs", entry } })
      }
    />
  )
}

export const Route = createFileRoute("/_dashboard/_apk/aph/history")({
  component: HistoryRoute,
})
