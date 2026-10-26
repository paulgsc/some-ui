import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { DeviceSection } from "@/components/settings/device-section"
import {
  SettingsBlock,
  SettingsPage,
} from "@/components/settings/settings-page"

/**
 * The front desk's Home page, the Android app's: the one place on the phone
 * that pairs with home and sends to it on a tap (LA8), and what its person
 * keeps there (LA12, LA13, the sharing ledger).
 */
const HomePage = (): JSX.Element => (
  <SettingsPage id="home">
    {import.meta.env.VITE_DEVICE_BACKEND === "true" ? (
      <SettingsBlock>
        <DeviceSection />
      </SettingsBlock>
    ) : null}
  </SettingsPage>
)

export const Route = createFileRoute("/_dashboard/_apk/settings/home")({
  component: HomePage,
})
