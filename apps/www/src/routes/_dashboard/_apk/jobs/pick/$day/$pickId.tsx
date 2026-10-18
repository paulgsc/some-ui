import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { PickFlow } from "@/components/jobs/pick"

const PickRoute = (): JSX.Element | null => {
  const { day, pickId } = Route.useParams()
  return import.meta.env.VITE_DEVICE_BACKEND === "true" ? (
    <PickFlow day={day} pickId={pickId} />
  ) : null
}

export const Route = createFileRoute("/_dashboard/_apk/jobs/pick/$day/$pickId")(
  {
    component: PickRoute,
  }
)
