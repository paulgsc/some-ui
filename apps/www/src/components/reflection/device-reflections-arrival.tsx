/**
 * "Did they arrive?" after a reflection share, asked once for the whole app
 * rather than by the button that shared, which may be gone by then
 * (`arrivals`, `lib/agent-export`). Device build only, like this module
 * (`build.paths.ts`).
 */
import type { JSX } from "react"
import { useMemo, useSyncExternalStore } from "react"
import { counted } from "@some-ui/core-utils"
import { ConfirmSheet } from "@some-ui/shared"

import { arrivals } from "@/lib/agent-export"

import { arrived } from "./copy"

export const DeviceReflectionsArrival = (): JSX.Element => {
  const batch = useSyncExternalStore(
    arrivals.subscribe,
    arrivals.getSnapshot
  ).at(0)
  const request = useMemo(
    () =>
      batch
        ? arrived(
            counted(batch.length, "reflection"),
            "Keep them to share again",
            () => arrivals.answer(batch, true)
          )
        : null,
    [batch]
  )
  return (
    <ConfirmSheet
      request={request}
      open={batch !== undefined}
      onOpenChange={(open) => {
        if (!open && batch) arrivals.answer(batch, false)
      }}
    />
  )
}
