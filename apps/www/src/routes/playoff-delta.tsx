import type { JSX } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"

import { PlayoffDeltaPage } from "@/lib/web-surface"

/**
 * Playoff Delta's recording stage: a 9:16 story of one team's week, made to
 * be screen-recorded for a vlog. Standalone (the `mission.tsx` archetype), so
 * no shell sits in the frame. `?record` renders the one slide `?slide` names,
 * full-bleed with nothing to press, for the slide recorder; `?week` picks the
 * week either way.
 *
 * Web only: the stage comes through the web surface's door, and the Android
 * app's surface guard keeps the phone off this path.
 */

type PlayoffDeltaSearch = {
  week?: number
  slide?: number
  record?: boolean
}

const positiveInt = (value: unknown): number | undefined => {
  const n = typeof value === "number" ? value : Number(value)
  return Number.isInteger(n) && n >= 0 ? n : undefined
}

function validateSearch(search: Record<string, unknown>): PlayoffDeltaSearch {
  const week = positiveInt(search.week)
  const slide = positiveInt(search.slide)
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
    <PlayoffDeltaPage
      week={week}
      slide={slide}
      record={record}
      onWeekChange={(next) => {
        void navigate({ search: { week: next } })
      }}
    />
  )
}

export const Route = createFileRoute("/playoff-delta")({
  validateSearch,
  component: PlayoffDelta,
})
