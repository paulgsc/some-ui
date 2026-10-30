import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { AuthorshipRecord } from "@/lib/web-surface"

/**
 * Who made each scene (STUDIO ST16): the page every video's end card names.
 * `?r` is the video's record, one character a scene
 * (`@some-ui/burn-ins`' `recordCode`); the page draws it and keeps nothing.
 * It carries no viewer strip: the record it shows is a published video's
 * own, never sample data.
 */

type AuthorshipSearch = { r?: string }

// The router JSON-parses search values, and `true`, `false` and `null` are
// records too (a scene each), so they come back as text.
function validateAuthorshipSearch(
  search: Record<string, unknown>
): AuthorshipSearch {
  const { r } = search
  return typeof r === "string" || typeof r === "boolean" || r === null
    ? { r: String(r) }
    : {}
}

const Authorship = (): JSX.Element => {
  const { r } = Route.useSearch()
  return <AuthorshipRecord code={r} />
}

export const Route = createFileRoute("/authorship")({
  validateSearch: validateAuthorshipSearch,
  component: Authorship,
})
