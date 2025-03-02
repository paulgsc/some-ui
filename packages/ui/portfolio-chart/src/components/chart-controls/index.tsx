import {
  ArrowLeftIcon as ArrowPathIcon,
  PauseIcon,
  PlayIcon,
} from "lucide-react"
import { Button } from "some-ui-shared"

type ChartControlsProps = {
  isPlaying: boolean
  currentIndex: number
  totalTrades: number
  onReset: () => void
  onPlayPause: () => void
  onPrevious: () => void
  onNext: () => void
}

export const ChartControls = ({
  isPlaying,
  currentIndex,
  totalTrades,
  onReset,
  onPlayPause,
  onPrevious,
  onNext,
}: ChartControlsProps) => {
  return (
    <div className="flex items-center justify-between">
      <div className="flex space-x-2">
        <Button
          variant="outline"
          size="icon"
          onClick={onReset}
          aria-label="Reset animation"
        >
          <ArrowPathIcon className="size-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={onPlayPause}
          aria-label={isPlaying ? "Pause animation" : "Play animation"}
        >
          {isPlaying ? (
            <PauseIcon className="size-4" />
          ) : (
            <PlayIcon className="size-4" />
          )}
        </Button>
      </div>
      <div className="flex space-x-2">
        <Button
          variant="outline"
          onClick={onPrevious}
          disabled={currentIndex <= 0}
          aria-label="Previous trade"
        >
          Previous
        </Button>
        <Button
          variant="outline"
          onClick={onNext}
          disabled={currentIndex >= totalTrades - 1}
          aria-label="Next trade"
        >
          Next
        </Button>
      </div>
    </div>
  )
}
