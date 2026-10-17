import { createFileRoute } from "@tanstack/react-router"

import { settingsQuery } from "@/lib/tenant"
import { StudySettings } from "@/components/settings/study-settings"

/**
 * Practice's own settings on the phone (lib/wings): the voice lessons speak in
 * and the study reminders. The theme and this phone's controls are the front
 * desk's (`/settings`), reached from the foyer.
 */
export const Route = createFileRoute("/_dashboard/_apk/practice/settings")({
  loader: ({ context }) => {
    void context.queryClient.prefetchQuery(settingsQuery)
  },
  component: StudySettings,
})
