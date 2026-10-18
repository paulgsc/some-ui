/**
 * "Did they arrive?" after a reflection share, asked once for the whole app
 * rather than by the button that shared, which may be gone by then
 * (`arrivals`, `lib/agent-export`). Shares still waiting are asked about
 * together, so answering one never swaps the next in under the same finger.
 * A share queued behind another (`shareFiles`) opens Android's sheet over
 * this question and lands as the person comes back from it, so the question
 * says so before they can answer it.
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
            // Two shares can carry the same reflection.
            counted(new Set(batches.flat()).size, "reflection"),
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
