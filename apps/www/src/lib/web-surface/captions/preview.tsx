import type { JSX } from "react"
import { CaptionsPreview } from "@some-ui/captions"

// The looks' font (captions' src/lib/theme.ts), only in this chunk.
import "@fontsource/barlow-condensed/latin-600.css"
import "@fontsource/barlow-condensed/latin-800.css"

export type CaptionsPreviewProps = {
  /** The look to open on; an unknown one opens on the default. */
  theme?: string
  /** Where in the sample to open, in milliseconds. */
  at?: number
}

/** The subtitles' preview. */
export const CaptionsPreviewPage = ({
  theme,
  at,
}: CaptionsPreviewProps): JSX.Element => (
  <CaptionsPreview initialTheme={theme} initialAtMs={at} />
)
