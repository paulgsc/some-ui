import type { JSX } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"

import { VIEWER_BUILD } from "@/lib/data-mode"
import { stageSearch } from "@/lib/stage-search"
import { EssayStage } from "@/lib/web-surface"
import { ViewerStrip } from "@/components/provenance-strip"

/**
 * The essays' stage (RR15, #2690): one scene of an essay at a time, as
 * `/call` plays the weekly call's. `?kind=interview` plays the interview
 * essay (IW6, #2937), `?kind=spoken` a cards essay's spoken card (WALK7,
 * `?week` naming the card), and otherwise the Rust Rounds essay. Standalone, so no
 * shell sits in the frame; `?week` names the essay by its week's id
 * ("sample" for the template's, as with none), `?scene` the scene, and
 * `?record` leaves out everything but the frame. A viewer of the Pages build
 * gets the viewer strip above it. Web only: the stage comes through the web
 * surface's door.
 */

const Essay = (): JSX.Element => {
  const { week, kind, scene, record } = Route.useSearch()
  const navigate = useNavigate({ from: "/essay" })
  return (
    <>
      {VIEWER_BUILD && !record && <ViewerStrip />}
      <EssayStage
        kind={kind}
        week={week}
        scene={scene}
        record={record}
        onScene={(next) => {
          void navigate({
            search: {
              ...(kind ? { kind } : {}),
              ...(week ? { week } : {}),
              scene: next,
            },
          })
        }}
      />
    </>
  )
}

export const Route = createFileRoute("/essay")({
  validateSearch: stageSearch,
  component: Essay,
})
