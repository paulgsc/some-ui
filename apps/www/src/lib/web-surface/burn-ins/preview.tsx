import type { JSX } from "react"
import { BurnInsPreview } from "@some-ui/burn-ins"

// The burn-ins' one font (burn-ins' src/lib/text.ts and its captions' looks),
// only in this chunk.
import "@fontsource/barlow-condensed/latin-600.css"
import "@fontsource/barlow-condensed/latin-800.css"

export type BurnInsPreviewProps = {
  /** The kind to open on; an unknown one opens on subtitles. */
  kind?: string
  /** The look to open on; one the kind lacks opens on its default. */
  design?: string
  /** Where in the sample to open, in milliseconds. */
  at?: number
}

/** What every video carries, on sample data. */
export const BurnInsPreviewPage = ({
  kind,
  design,
  at,
}: BurnInsPreviewProps): JSX.Element => (
  <BurnInsPreview initialKind={kind} initialDesign={design} initialAtMs={at} />
)
