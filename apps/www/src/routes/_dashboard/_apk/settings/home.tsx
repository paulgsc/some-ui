import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { DeviceLimits } from "@/components/settings/device-limits"
import { DeviceSection } from "@/components/settings/device-section"
import {
  SettingsBlock,
  SettingsPage,
} from "@/components/settings/settings-page"

const HomePage = (): JSX.Element => (
  <SettingsPage id="home">
    {import.meta.env.VITE_DEVICE_BACKEND === "true" ? (
      <>
        <SettingsBlock>
          <DeviceSection />
        </SettingsBlock>
        <DeviceLimits concern="home" />
      </>
    ) : null}
  </SettingsPage>
)

export const Route = createFileRoute("/_dashboard/_apk/settings/home")({
  component: HomePage,
})
