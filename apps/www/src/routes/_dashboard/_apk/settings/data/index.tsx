import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { DeviceMyData } from "@/components/settings/device-my-data"
import { SettingsPage } from "@/components/settings/settings-page"

/** My data (MY-DATA, paulgsc/some-ui#2473): what you keep, where, and how it grows. */
const DataPage = (): JSX.Element => (
  <SettingsPage id="data">
    {import.meta.env.VITE_DEVICE_BACKEND === "true" ? <DeviceMyData /> : null}
  </SettingsPage>
)

export const Route = createFileRoute("/_dashboard/_apk/settings/data/")({
  component: DataPage,
})
