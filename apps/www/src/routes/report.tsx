import type { JSX } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"

import { VIEWER_BUILD } from "@/lib/data-mode"
import { ReportStage } from "@/lib/web-surface"
import { ViewerStrip } from "@/components/provenance-strip"

/**
 * The weekly engagement report's stage (ENG12, #2700): one scene of the
 * report at a time, as `/essay` plays the essay's. Standalone, so no shell
 * sits in the frame; `?week` names the report by its ISO week ("2026-W46";
 * "sample" for the template's, as with none), `?scene` the scene, and
 * `?record` leaves out everything but the frame. A viewer of the Pages build
 * gets the viewer strip above it, and the sample whatever week is named.
 * Web only: the stage comes through the web surface's door.
 */

type ReportSearch = { week?: string; scene?: string; record?: boolean }

function validateSearch(search: Record<string, unknown>): ReportSearch {
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

const Report = (): JSX.Element => {
  const { week, scene, record } = Route.useSearch()
  const navigate = useNavigate({ from: "/report" })
  return (
    <>
      {VIEWER_BUILD && !record && <ViewerStrip />}
      <ReportStage
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

export const Route = createFileRoute("/report")({
  validateSearch,
  component: Report,
})
