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

/**
 * The front desk's This phone page, the Android app's: what the phone keeps
 * and how much room it has left, and copying finished sessions off it. Home
 * is its own page (Settings → Home).
 */
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
