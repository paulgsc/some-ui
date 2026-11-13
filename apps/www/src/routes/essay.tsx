import type { JSX } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"

import { VIEWER_BUILD } from "@/lib/data-mode"
import { stageSearch } from "@/lib/stage-search"
import { EssayStage } from "@/lib/web-surface"
import { ViewerStrip } from "@/components/provenance-strip"

/**
 * The Rust Rounds essay's stage (RR15, #2690): one scene of the essay at a
 * time, as `/call` plays the weekly call's. Standalone, so no shell sits in
 * the frame; `?week` names the essay by its week's id ("sample" for the
 * template's, as with none), `?scene` the scene, and `?record` leaves out
 * everything but the frame. A viewer of the Pages build gets the viewer strip
 * above it. Web only: the stage comes through
 * the web surface's door.
 */

const Essay = (): JSX.Element => {
  const { week, scene, record } = Route.useSearch()
  const navigate = useNavigate({ from: "/essay" })
  return (
    <>
      {VIEWER_BUILD && !record && <ViewerStrip />}
      <EssayStage
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

export const Route = createFileRoute("/essay")({
  validateSearch: stageSearch,
  component: Essay,
})
