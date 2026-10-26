import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

import {
  SettingsBlock,
  SettingsPage,
} from "@/components/settings/settings-page"
import { ThemeField } from "@/components/settings/theme-field"

/** The front desk's Appearance page: the theme, on every build. */
const AppearancePage = (): JSX.Element => (
  <SettingsPage id="appearance">
    <SettingsBlock>
      <ThemeField />
    </SettingsBlock>
  </SettingsPage>
)

export const Route = createFileRoute("/_dashboard/settings/appearance")({
  component: AppearancePage,
})
