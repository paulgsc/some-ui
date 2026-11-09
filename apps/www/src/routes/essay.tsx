import type { JSX } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"

import { VIEWER_BUILD } from "@/lib/data-mode"
import { EssayStage } from "@/lib/web-surface"
import { ViewerStrip } from "@/components/provenance-strip"

/**
 * The Rust Rounds essay's stage (RR15, #2690): one scene of the essay at a
 * time, as `/call` plays the weekly call's. Standalone, so no shell sits in
 * the frame; `?scene` names the scene and `?record` leaves out everything
 * but the frame. It plays the template's sample essay. A viewer of the Pages
 * build gets the viewer strip above it. Web only: the stage comes through
 * the web surface's door.
 */

type EssaySearch = { scene?: string; record?: boolean }

function validateSearch(search: Record<string, unknown>): EssaySearch {
  const record = search.record === true || search.record === "true"
  return {
    ...(typeof search.scene === "string" && search.scene !== ""
      ? { scene: search.scene }
      : {}),
    ...(record ? { record } : {}),
  }
}

const Essay = (): JSX.Element => {
  const { scene, record } = Route.useSearch()
  const navigate = useNavigate({ from: "/essay" })
  return (
    <>
      {VIEWER_BUILD && !record && <ViewerStrip />}
      <EssayStage
        scene={scene}
        record={record}
        onScene={(next) => {
          void navigate({ search: { scene: next } })
        }}
      />
    </>
  )
}

export const Route = createFileRoute("/essay")({
  validateSearch,
  component: Essay,
})
