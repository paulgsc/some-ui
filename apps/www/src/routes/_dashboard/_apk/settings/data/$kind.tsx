import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { DeviceMyDataKind } from "@/components/settings/device-my-data"

/** One kind of recording in My data (MY-DATA MD2, #2476): newest first. */
const KindPage = (): JSX.Element => {
  const { kind } = Route.useParams()
  return (
    <div className="max-w-xl space-y-4">
      {import.meta.env.VITE_DEVICE_BACKEND === "true" ? (
        <DeviceMyDataKind kind={kind} />
      ) : null}
    </div>
  )
}

export const Route = createFileRoute("/_dashboard/_apk/settings/data/$kind")({
  component: KindPage,
})
