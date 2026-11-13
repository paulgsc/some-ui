import type { JSX } from "react"
import { AphHistory } from "@some-ui/aph"
import { createFileRoute, useNavigate } from "@tanstack/react-router"

import { useAphVisit } from "@/lib/aph-visit"
import { useMinuteClock } from "@/lib/clock"

const HistoryRoute = (): JSX.Element => {
  const navigate = useNavigate()
  // The host's clock: "today" in the list turns over at midnight.
  const now = useMinuteClock()
  const visit = useAphVisit()
  return (
    <AphHistory
      now={now}
      visit={visit}
      onEnterTheirs={(entry) =>
        void navigate({ to: "/aph", search: { side: "theirs", entry } })
      }
      onLogDay={(day) => void navigate({ to: "/aph", search: { day } })}
    />
  )
}

export const Route = createFileRoute("/_dashboard/_apk/aph/history")({
  component: HistoryRoute,
})
