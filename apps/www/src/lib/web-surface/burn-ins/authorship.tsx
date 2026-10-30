import type { JSX } from "react"
import { AuthorshipRecord } from "@some-ui/burn-ins"

// The same font as the mark in a video, so the page draws what the video did.
import "@fontsource/barlow-condensed/latin-600.css"
import "@fontsource/barlow-condensed/latin-800.css"

/** The page an authorship mark's end card names, for the record in `code`. */
export const AuthorshipRecordPage = ({
  code,
}: {
  code?: string
}): JSX.Element => <AuthorshipRecord code={code} />
