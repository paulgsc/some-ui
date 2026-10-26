import type { JSX } from "react"
import { createFileRoute, redirect } from "@tanstack/react-router"

import { VIEWER_BUILD } from "@/lib/data-mode"
import { DataHomeSection } from "@/components/settings/data-home-section"
import {
  SettingsBlock,
  SettingsPage,
} from "@/components/settings/settings-page"

/**
 * Outside settings' own outcome, so signing out works when settings don't
 * load. The Android app and a viewer's build have no account, so both are
 * sent back to the desk; the inline check keeps the account's code out of
 * the Android app's bundle (`check:bundle-paths`), as this route ships there.
 */
const AccountPage = (): JSX.Element => (
  <SettingsPage id="account">
    {import.meta.env.VITE_DEVICE_BACKEND === "true" ? null : (
      <SettingsBlock>
        <DataHomeSection />
      </SettingsBlock>
    )}
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
