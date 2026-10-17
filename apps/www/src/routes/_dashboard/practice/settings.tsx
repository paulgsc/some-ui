import { createFileRoute } from "@tanstack/react-router"

import { settingsQuery } from "@/lib/tenant"
import { StudySettings } from "@/components/settings/study-settings"

/**
 * Practice's own settings (lib/wings), on the phone and the desktop web: the
 * voice lessons speak in and the study reminders. The theme and the account
 * or this phone's controls are the front desk's (`/settings`).
 */
export const Route = createFileRoute("/_dashboard/practice/settings")({
  loader: ({ context }) => {
    void context.queryClient.prefetchQuery(settingsQuery)
  },
  component: StudySettings,
})
