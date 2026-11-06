import type { JSX } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"

import { VIEWER_BUILD } from "@/lib/data-mode"
import { CallStage } from "@/lib/web-surface"
import { ViewerStrip } from "@/components/provenance-strip"

/**
 * The weekly call's stage (STUDIO ST29): one scene of the week at a time.
 * Standalone (the `mission.tsx` archetype), so no shell sits in the frame;
 * `?week` names the week by its first day ("sample" for the template's),
 * `?scene` the scene, and `?record` leaves out everything but the frame.
 * A viewer of the Pages build gets the viewer strip above it. Web only: the
 * stage comes through the web surface's door.
 */

type CallSearch = { week?: string; scene?: string; record?: boolean }

function validateSearch(search: Record<string, unknown>): CallSearch {
  const record = search.record === true || search.record === "true"
  return {
    ...(typeof search.week === "string" && search.week !== ""
      ? { week: search.week }
      : {}),
    ...(typeof search.scene === "string" && search.scene !== ""
      ? { scene: search.scene }
      : {}),
    ...(record ? { record } : {}),
  }
}

const Call = (): JSX.Element => {
  const { week, scene, record } = Route.useSearch()
  const navigate = useNavigate({ from: "/call" })
  return (
    <>
      {VIEWER_BUILD && !record && <ViewerStrip />}
      <CallStage
        week={week}
        scene={scene}
        record={record}
        onScene={(next) => {
          void navigate({ search: { ...(week ? { week } : {}), scene: next } })
        }}
      />
    </>
  )
}

export const Route = createFileRoute("/call")({
  validateSearch,
  component: Call,
})
