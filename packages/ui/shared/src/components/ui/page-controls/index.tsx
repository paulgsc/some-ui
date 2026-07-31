import type { FC } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { cn } from "../../../lib/utils"
import { Button } from "../button"

type PageControlsProps = {
  /** 0-based. */
  page: number
  pageCount: number
  onPrevious: () => void
  onNext: () => void
  /** What is being paged, for the screen-reader label ("sections", "exercises"). */
  label: string
  className?: string
}

/**
 * The footer for a paged list: previous/next plus "2 / 5".
 *
 * Renders nothing for a single page, so a list that happens to fit shows no
 * chrome at all — paging is what a bounded box does when it has to, not a
 * decoration it wears regardless.
 */
export const PageControls: FC<PageControlsProps> = ({
  page,
  pageCount,
  onPrevious,
  onNext,
  label,
  className,
}) => {
  if (pageCount <= 1) return null

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-between gap-2",
        className
      )}
    >
      <Button
        variant="ghost"
        size="sm"
        onClick={onPrevious}
        disabled={page === 0}
        aria-label={`Previous page of ${label}`}
        className="gap-1"
      >
        <ChevronLeft className="h-4 w-4" />
        Prev
      </Button>

      <span
        className="font-mono text-xs tabular-nums text-muted-foreground"
        aria-live="polite"
      >
        {page + 1} / {pageCount}
      </span>

      <Button
        variant="ghost"
        size="sm"
        onClick={onNext}
        disabled={page >= pageCount - 1}
        aria-label={`Next page of ${label}`}
        className="gap-1"
      >
        Next
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  )
}
