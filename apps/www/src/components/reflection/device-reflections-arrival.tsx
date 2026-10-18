/**
 * "Did they arrive?" after a reflection share, asked once for the whole app
 * rather than by the button that shared, which may be gone by then
 * (`arrivals`, `lib/agent-export`). Shares still waiting are asked about
 * together, so a quick second tap never answers a question it did not see.
 * Device build only, like this module (`build.paths.ts`).
 */
import type { JSX } from "react"
import { useMemo, useSyncExternalStore } from "react"
import { counted } from "@some-ui/core-utils"
import { ConfirmSheet } from "@some-ui/shared"

import { arrivals } from "@/lib/agent-export"

import { arrived } from "./copy"

export const DeviceReflectionsArrival = (): JSX.Element => {
  const batches = useSyncExternalStore(arrivals.subscribe, arrivals.getSnapshot)
  const request = useMemo(
    () =>
      batches.length === 0
        ? null
        : arrived(
            counted(
              batches.reduce((n, batch) => n + batch.length, 0),
              "reflection"
            ),
            "Keep them to share again",
            () => {
              for (const batch of batches) arrivals.answer(batch, true)
            }
          ),
    [batches]
  )
  return (
    <ConfirmSheet
      request={request}
      open={batches.length > 0}
      onOpenChange={(open) => {
        if (!open) for (const batch of batches) arrivals.answer(batch, false)
      }}
    />
  )
}
