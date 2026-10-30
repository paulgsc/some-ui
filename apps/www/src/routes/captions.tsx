import { createFileRoute, redirect } from "@tanstack/react-router"

import { wholeNumber } from "@/lib/search-params"

/**
 * The subtitles preview's old address (GWB11): subtitles are one of the
 * burn-ins now (STUDIO ST15), so `/captions?theme=…&at=…` opens `/burn-ins`
 * on them, the look as its design.
 */

type CaptionsSearch = { theme?: string; at?: number }

function validateSearch(search: Record<string, unknown>): CaptionsSearch {
  const at = wholeNumber(search.at)
  return {
    ...(typeof search.theme === "string" ? { theme: search.theme } : {}),
    ...(at === undefined ? {} : { at }),
  }
}

export const Route = createFileRoute("/captions")({
  validateSearch,
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/burn-ins",
      search: {
        kind: "captions",
        ...(search.theme === undefined ? {} : { design: search.theme }),
        ...(search.at === undefined ? {} : { at: search.at }),
      },
      replace: true,
    })
  },
})
