import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

import {
  DeviceArchive,
  DeviceStorageSummary,
} from "@/components/settings/device-storage"
import {
  SettingsBlock,
  SettingsPage,
} from "@/components/settings/settings-page"

const PhonePage = (): JSX.Element => (
  <SettingsPage id="phone">
    {import.meta.env.VITE_DEVICE_BACKEND === "true" ? (
      <SettingsBlock>
        <DeviceStorageSummary />
        <DeviceArchive />
      </SettingsBlock>
    ) : null}
  </SettingsPage>
)

export const Route = createFileRoute("/_dashboard/_apk/settings/phone")({
  component: PhonePage,
})
