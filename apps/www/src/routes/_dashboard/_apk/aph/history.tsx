import type { JSX } from "react"
import { AphHistory } from "@some-ui/aph"
import { createFileRoute, useNavigate } from "@tanstack/react-router"

const HistoryRoute = (): JSX.Element => {
  const navigate = useNavigate()
  return (
    <AphHistory
      onEnterTheirs={(entry) =>
        void navigate({ to: "/aph", search: { side: "theirs", entry } })
      }
    />
  )
}

export const Route = createFileRoute("/_dashboard/_apk/aph/history")({
  component: HistoryRoute,
})
