import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { VIEWER_BUILD } from "@/lib/data-mode"
import { AuthorshipRecord } from "@/lib/web-surface"
import { ViewerStrip } from "@/components/provenance-strip"

/**
 * Who made each scene (STUDIO ST16): the page every video's end card names.
 * `?r` is the video's record, one character a scene
 * (`@some-ui/burn-ins`' `recordCode`); the page draws it and keeps nothing.
 */

type AuthorshipSearch = { r?: string }

function validateAuthorshipSearch(
  search: Record<string, unknown>
): AuthorshipSearch {
  return typeof search.r === "string" ? { r: search.r } : {}
}

const Authorship = (): JSX.Element => {
  const { r } = Route.useSearch()
  return (
    <>
      {VIEWER_BUILD && <ViewerStrip />}
      <AuthorshipRecord code={r} />
    </>
  )
}

export const Route = createFileRoute("/authorship")({
  validateSearch: validateAuthorshipSearch,
  component: Authorship,
})
