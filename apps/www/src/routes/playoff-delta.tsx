import type { JSX } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"

import { VIEWER_BUILD } from "@/lib/data-mode"
import { wholeNumber } from "@/lib/search-params"
import { PlayoffDeltaStage } from "@/lib/web-surface"
import { ViewerStrip } from "@/components/provenance-strip"

/**
 * Playoff Delta's recording stage. Standalone (the `mission.tsx` archetype),
 * so no shell sits in the frame; `?week` (0: the legend episode), `?slide`
 * and `?record` reach the stage as they are, and `?scene` and `?v` name a
 * scene of a format version's shape for the voiced recorder (FEED3). A
 * viewer of the Pages build, who reaches it from the foyer, gets the viewer
 * strip above it; the owner records elsewhere. Web only: the stage comes through the web surface's
 * door, and the Android app's surface guard keeps the phone off this path.
 */

type PlayoffDeltaSearch = {
  week?: number
  slide?: number
  record?: boolean
  scene?: string
  v?: number
}

function validateSearch(search: Record<string, unknown>): PlayoffDeltaSearch {
  const week = wholeNumber(search.week)
  const slide = wholeNumber(search.slide)
  const record = search.record === true || search.record === "true"
  const scene =
    typeof search.scene === "string" && search.scene !== ""
      ? search.scene
      : undefined
  const v = wholeNumber(search.v)
  return {
    ...(week === undefined ? {} : { week }),
    ...(slide === undefined ? {} : { slide }),
    ...(record ? { record } : {}),
    ...(scene === undefined ? {} : { scene }),
    ...(v === undefined || v === 0 ? {} : { v }),
  }
}

const PlayoffDelta = (): JSX.Element => {
  const { week, slide, record, scene, v } = Route.useSearch()
  const navigate = useNavigate({ from: "/playoff-delta" })
  return (
    <>
      {VIEWER_BUILD && <ViewerStrip />}
      <PlayoffDeltaStage
        week={week}
        initialSlide={slide}
        record={record}
        scene={scene}
        version={v}
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
