import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { DeviceMyDataWordSets } from "@/components/settings/device-my-data-word-sets"

/**
 * My data's Korean word sets page (MY-DATA MD7, #2496): each word set this
 * phone keeps for Read aloud, and Archive or Bring back on each.
 */
const WordSetsPage = (): JSX.Element => (
  <div className="max-w-xl space-y-4">
    {import.meta.env.VITE_DEVICE_BACKEND === "true" ? (
      <DeviceMyDataWordSets />
    ) : null}
  </div>
)

export const Route = createFileRoute(
  "/_dashboard/_apk/settings/data/word-sets"
)({ component: WordSetsPage })
