import type { JSX } from "react"
import { cn } from "@some-ui/core-utils"
import { Button } from "@some-ui/shared"
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Languages,
  Volume2,
} from "lucide-react"

type LadderDockProps = {
  /** The line's rung: audio only, Hangul, gloss (canon Cor. 4.4). */
  rung: 0 | 1 | 2
  /** Whether the next rung may be reached now. */
  canReveal: boolean
  audio: boolean
  speaking: boolean
  canGoBack: boolean
  /** The back button's accessible name. */
  previousLabel: string
  onReplay: () => void
  onReveal: () => void
  onPrev: () => void
  onNext: () => void
}

/** The thumb's controls for one line on its ladder, and moving on. */
export const LadderDock = ({
  rung,
  canReveal,
  audio,
  speaking,
  canGoBack,
  previousLabel,
  onReplay,
  onReveal,
  onPrev,
  onNext,
}: LadderDockProps): JSX.Element => (
  <>
    <div className="flex gap-2">
      {audio && (
        <Button
          variant="secondary"
          className="h-12 min-w-0 flex-1 gap-2 rounded-2xl"
          onClick={onReplay}
          aria-label="Play line"
        >
          <Volume2 className={cn("size-5", speaking && "animate-pulse")} />
          {rung === 0 ? "Listen" : "Again"}
        </Button>
      )}
      {canReveal && (
        <Button
          variant="outline"
          className="h-12 min-w-0 flex-1 gap-2 rounded-2xl"
          onClick={onReveal}
        >
          {rung === 0 ? (
            <>
              <Eye className="size-4" /> Show Korean
            </>
          ) : (
            <>
              <Languages className="size-4" /> Show English
            </>
          )}
        </Button>
      )}
    </div>
    <div className="flex gap-2">
      <Button
        variant="ghost"
        className="h-12 rounded-2xl px-3"
        onClick={onPrev}
        disabled={!canGoBack}
        aria-label={previousLabel}
      >
        <ChevronLeft className="size-5" />
      </Button>
      <Button
        className="h-12 min-w-0 flex-1 gap-2 rounded-2xl"
        onClick={onNext}
      >
        Next <ChevronRight className="size-5" />
      </Button>
    </div>
  </>
)
