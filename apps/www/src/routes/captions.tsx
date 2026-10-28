import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { VIEWER_BUILD } from "@/lib/data-mode"
import { wholeNumber } from "@/lib/search-params"
import { CaptionsPreview } from "@/lib/web-surface"
import { ViewerStrip } from "@/components/provenance-strip"

/**
 * The subtitles preview (GWB11). `?theme` names the look it opens on (the
 * preview falls back to the default for an unknown one) and `?at` how far
 * into the sample, in milliseconds.
 */

type CaptionsSearch = { theme?: string; at?: number }

function validateSearch(search: Record<string, unknown>): CaptionsSearch {
  const at = wholeNumber(search.at)
  return {
    ...(typeof search.theme === "string" ? { theme: search.theme } : {}),
    ...(at === undefined ? {} : { at }),
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
