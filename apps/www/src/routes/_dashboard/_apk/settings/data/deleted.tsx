import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { DeviceMyDataReceipts } from "@/components/settings/device-my-data"

/**
 * My data's Deleted page (MY-DATA MD3, #2477): the receipt of each
 * recording deleted for good, newest first, kept on home for good.
 */
const DeletedPage = (): JSX.Element => (
  <div className="max-w-xl space-y-4">
    {import.meta.env.VITE_DEVICE_BACKEND === "true" ? (
      <DeviceMyDataReceipts />
    ) : null}
  </div>
)

export const Route = createFileRoute("/_dashboard/_apk/settings/data/deleted")({
  component: DeletedPage,
})
