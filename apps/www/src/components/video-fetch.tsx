/**
 * A video home holds, until the phone has it: the Watch button with the
 * video's size, how far the fetch has got, and why it failed. The page draws
 * the video itself once the fetch is ready. Every word is `VIDEOS_WORDS`.
 * Phone build only.
 */
import type { JSX } from "react"
import { formatSize } from "@some-ui/core-utils"
import { Button } from "@some-ui/shared"

import type { Fetch } from "@/lib/call-videos/model"
import { VIDEOS_WORDS as WORDS } from "@/lib/call-videos/words"

export const VideoFetch = ({
  fetch,
  bytes,
  onWatch,
  className,
}: {
  /** The fetch, unless it is ready. */
  fetch: Exclude<Fetch, { kind: "ready" }> | undefined
  /** The video's size, when home said it. */
  bytes: number | null
  onWatch: () => void
  /** The Watch button's, for its place in the page's layout. */
  className?: string
}): JSX.Element => {
  if (fetch?.kind === "fetching") {
    return (
      <p className="text-muted-foreground text-sm">
        {WORDS.bringing(fetch.done, fetch.total)}
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-1">
      {fetch?.kind === "failed" && (
        <p className="text-muted-foreground text-sm">
          {WORDS.failed[fetch.why]}
        </p>
      )}
      <Button
        size="sm"
        variant="outline"
        className={className}
        onClick={onWatch}
      >
        {WORDS.watch}
        {bytes === null ? "" : ` (${formatSize(bytes)})`}
      </Button>
    </div>
  )
}
