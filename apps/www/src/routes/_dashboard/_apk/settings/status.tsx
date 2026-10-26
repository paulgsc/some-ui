import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { SettingsPage } from "@/components/settings/settings-page"
import { StatusBoard } from "@/components/settings/status-board"

const StatusPage = (): JSX.Element => (
  <SettingsPage id="status">
    <StatusBoard />
  </SettingsPage>
)

export const Route = createFileRoute("/_dashboard/_apk/settings/status")({
  component: StatusPage,
})
