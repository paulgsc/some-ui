import type { JSX } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"

import { VIEWER_BUILD } from "@/lib/data-mode"
import { PlayoffDeltaStage } from "@/lib/web-surface"
import { ViewerStrip } from "@/components/provenance-strip"

/**
 * Playoff Delta's recording stage. Standalone (the `mission.tsx` archetype),
 * so no shell sits in the frame; `?week`, `?slide` and `?record` reach the
 * stage as they are. A viewer of the Pages build, who reaches it from the
 * foyer, gets the viewer strip above it; the owner records elsewhere. Web only: the stage comes through the web surface's
 * door, and the Android app's surface guard keeps the phone off this path.
 */

type PlayoffDeltaSearch = {
  week?: number
  slide?: number
  record?: boolean
}

const wholeNumber = (value: unknown): number | undefined => {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/.test(value)
        ? Number(value)
        : Number.NaN
  return Number.isInteger(n) && n >= 0 ? n : undefined
}

function validateSearch(search: Record<string, unknown>): PlayoffDeltaSearch {
  const week = wholeNumber(search.week)
  const slide = wholeNumber(search.slide)
  const record = search.record === true || search.record === "true"
  return {
    ...(week === undefined ? {} : { week }),
    ...(slide === undefined ? {} : { slide }),
    ...(record ? { record } : {}),
  }
}

const PlayoffDelta = (): JSX.Element => {
  const { week, slide, record } = Route.useSearch()
  const navigate = useNavigate({ from: "/playoff-delta" })
  return (
    <>
      {VIEWER_BUILD && <ViewerStrip />}
      <PlayoffDeltaStage
        week={week}
        initialSlide={slide}
        record={record}
        onWeekChange={(next) => {
          void navigate({ search: { week: next } })
        }}
      />
    </>
  )
}

export const Route = createFileRoute("/playoff-delta")({
  validateSearch,
  component: PlayoffDelta,
})
