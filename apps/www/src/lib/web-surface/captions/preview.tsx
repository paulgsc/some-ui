import type { JSX } from "react"
import { CaptionsPreview } from "@some-ui/captions"

// The captions' one font, in the two weights the looks use, loaded with the
// preview's own chunk so no other page pays for it (packages/ui/captions,
// src/lib/theme.ts).
import "@fontsource/barlow-condensed/latin-600.css"
import "@fontsource/barlow-condensed/latin-800.css"

export type CaptionsPreviewProps = {
  /** The look to open on; an unknown one opens on the default. */
  theme?: string
  /** Where in the sample to open, in milliseconds. */
  at?: number
}

/** The subtitles' preview, with the font the video is set in. */
export const CaptionsPreviewPage = ({
  theme,
  at,
}: CaptionsPreviewProps): JSX.Element => (
  <CaptionsPreview initialTheme={theme} initialAtMs={at} />
)
