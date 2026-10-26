import type { JSX } from "react"
import { createFileRoute, redirect } from "@tanstack/react-router"

import { VIEWER_BUILD } from "@/lib/data-mode"
import { DataHomeSection } from "@/components/settings/data-home-section"
import {
  SettingsBlock,
  SettingsPage,
} from "@/components/settings/settings-page"

/**
 * The front desk's Account page, the web's: where sessions are kept, the
 * sign-in, the phones. Outside settings' own outcome, so signing out works
 * when settings don't load. The Android app has no account (its home is
 * Settings → Home), and a viewer's build none at all, so both are sent back
 * to the desk, which offers neither.
 */
const AccountPage = (): JSX.Element => (
  <SettingsPage id="account">
    <SettingsBlock>
      <DataHomeSection />
    </SettingsBlock>
  </SettingsPage>
)

export const Route = createFileRoute("/_dashboard/settings/account")({
  beforeLoad: () => {
    if (import.meta.env.VITE_DEVICE_BACKEND === "true" || VIEWER_BUILD) {
      throw redirect({ to: "/settings" })
    }
  },
  component: AccountPage,
})
