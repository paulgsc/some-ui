import type { JSX } from "react"
import { Button } from "@some-ui/shared"

type PaginationControlsProps = {
  currentPage: number
  totalPages: number
  onPrevious: () => void
  onNext: () => void
}

/** Renders nothing when everything fits on one page - callers don't need to check totalPages themselves. */
export const PaginationControls = ({
  currentPage,
  totalPages,
  onPrevious,
  onNext,
}: PaginationControlsProps): JSX.Element | null => {
  if (totalPages <= 1) return null

  return (
    <div className="flex items-center justify-between pt-1">
      <Button
        size="sm"
        variant="outline"
        onClick={onPrevious}
        disabled={currentPage === 1}
      >
        Previous
      </Button>
      <span className="text-muted-foreground text-xs">
        Page {currentPage} of {totalPages}
      </span>
      <Button
        size="sm"
        variant="outline"
        onClick={onNext}
        disabled={currentPage === totalPages}
      >
        Next
      </Button>
    </div>
  )
}
