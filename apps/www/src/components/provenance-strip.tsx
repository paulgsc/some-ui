import type { JSX } from "react"
import { Eye } from "lucide-react"

import { VIEWER_BUILD } from "@/lib/data-mode"
import type { Wing } from "@/lib/wings"

/**
 * What a viewer on the Pages build reads above a screen of the owner's: that
 * this is the owner's tool on sample data, and nothing they do is kept
 * (`lib/demo`).
 */
export const ViewerStrip = (): JSX.Element => (
  <div
    role="note"
    className="bg-brand/15 flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2 text-xs sm:px-6"
  >
    <span className="text-brand-foreground dark:text-brand inline-flex items-center gap-1.5 font-semibold">
      <Eye aria-hidden className="size-3.5" />
      Viewing
    </span>
    <span className="text-muted-foreground">
      My tool on sample data: try anything, and nothing you do is kept. My own
      data stays on my home network.
    </span>
  </div>
)

/**
 * The line under the web header that says whose screen this is (CLAUDE.md,
 * "One screen, two readings"). To the owner: what the wing publishes and what
 * it keeps, a reminder as the app grows. To a viewer: `ViewerStrip`.
 */
export const ProvenanceStrip = ({
  exposure,
}: {
  exposure: NonNullable<Wing["exposure"]>
}): JSX.Element =>
  VIEWER_BUILD ? (
    <ViewerStrip />
  ) : (
    <div className="text-muted-foreground flex flex-wrap gap-x-5 gap-y-1 border-b px-4 py-2 text-xs sm:px-6">
      <span className="inline-flex items-center gap-2">
        <span
          aria-hidden
          className="border-muted-foreground size-2.5 rounded-full border-[1.5px]"
        />
        Published: {exposure.published}
      </span>
      <span className="inline-flex items-center gap-2">
        <span aria-hidden className="bg-foreground/80 size-2.5 rounded-full" />
        Private: {exposure.private}
      </span>
    </div>
  )
