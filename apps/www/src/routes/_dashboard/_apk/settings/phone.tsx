import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { DeviceLimits } from "@/components/settings/device-limits"
import { DeviceArchive } from "@/components/settings/device-storage"
import { SettingsPage } from "@/components/settings/settings-page"

const PhonePage = (): JSX.Element => (
  <SettingsPage id="phone">
    {import.meta.env.VITE_DEVICE_BACKEND === "true" ? (
      <>
        <DeviceLimits concern="phone" />
        <DeviceArchive />
      </>
    ) : null}
  </SettingsPage>
)

export const Route = createFileRoute("/_dashboard/_apk/settings/phone")({
  component: PhonePage,
})
