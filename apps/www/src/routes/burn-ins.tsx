import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { VIEWER_BUILD } from "@/lib/data-mode"
import { wholeNumber } from "@/lib/search-params"
import { BurnInRecord, BurnInsPreview } from "@/lib/web-surface"
import { ViewerStrip } from "@/components/provenance-strip"

/**
 * What every video carries (STUDIO ST15): the subtitles and cards code draws
 * into a video, on sample data. `?kind` names the kind it opens on, `?design`
 * the look (the preview falls back to the default for an unknown one) and
 * `?at` how far into the sample, in milliseconds. `?record` is the
 * recorder's page instead: one burn-in on a transparent stage, driven by
 * `tests/record/burn-ins.ts`, with nothing else drawn.
 */

type BurnInsSearch = {
  kind?: string
  design?: string
  at?: number
  record?: boolean
}

function validateBurnInsSearch(search: Record<string, unknown>): BurnInsSearch {
  const at = wholeNumber(search.at)
  const record = search.record === true || search.record === "true"
  return {
    ...(typeof search.kind === "string" ? { kind: search.kind } : {}),
    ...(typeof search.design === "string" ? { design: search.design } : {}),
    ...(at === undefined ? {} : { at }),
    ...(record ? { record } : {}),
  }
}

const BurnIns = (): JSX.Element => {
  const { kind, design, at, record } = Route.useSearch()
  if (record) return <BurnInRecord />
  return (
    <>
      {VIEWER_BUILD && <ViewerStrip />}
      <BurnInsPreview kind={kind} design={design} at={at} />
    </>
  )
}

export const Route = createFileRoute("/burn-ins")({
  validateSearch: validateBurnInsSearch,
  component: BurnIns,
})
