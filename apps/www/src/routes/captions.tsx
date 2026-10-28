import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { VIEWER_BUILD } from "@/lib/data-mode"
import { CaptionsPreview } from "@/lib/web-surface"
import { ViewerStrip } from "@/components/provenance-strip"

/**
 * The shorts' subtitles preview (GWB11): where the owner tunes the look the
 * renderer burns into each short, on sample lines. Standalone (the
 * `mission.tsx` archetype), so no shell sits beside the frame. `?theme` and
 * `?at` (milliseconds into the sample) say where it opens. A viewer of the
 * Pages build gets the viewer strip above it. Web only: the preview comes
 * through the web surface's door, and the Android app's surface guard keeps
 * the phone off this path.
 */

type CaptionsSearch = { theme?: string; at?: number }

function validateSearch(search: Record<string, unknown>): CaptionsSearch {
  const { theme, at } = search
  const ms =
    typeof at === "number"
      ? at
      : typeof at === "string" && /^\d+$/.test(at)
        ? Number(at)
        : Number.NaN
  return {
    ...(typeof theme === "string" && /^[a-z-]+$/.test(theme) ? { theme } : {}),
    ...(Number.isInteger(ms) && ms >= 0 ? { at: ms } : {}),
  }
}

const Captions = (): JSX.Element => {
  const { theme, at } = Route.useSearch()
  return (
    <>
      {VIEWER_BUILD && <ViewerStrip />}
      <CaptionsPreview theme={theme} at={at} />
    </>
  )
}

export const Route = createFileRoute("/captions")({
  validateSearch,
  component: Captions,
})
