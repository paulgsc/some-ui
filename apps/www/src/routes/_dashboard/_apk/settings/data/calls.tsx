import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { DeviceMyDataCalls } from "@/components/settings/device-my-data-calls"

/**
 * My data's page for each feed's videos, the weekly call's and Playoff
 * Delta's (ST38, #2661; FEED4): each episode's video, then the rest of it,
 * let go of home once its YouTube link is saved.
 */
const CallsPage = (): JSX.Element => (
  <div className="max-w-xl space-y-4">
    {import.meta.env.VITE_DEVICE_BACKEND === "true" ? (
      <DeviceMyDataCalls />
    ) : null}
  </div>
)

export const Route = createFileRoute("/_dashboard/_apk/settings/data/calls")({
  component: CallsPage,
})
