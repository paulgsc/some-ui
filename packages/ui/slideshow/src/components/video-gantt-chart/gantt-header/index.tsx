import { Clock, Info, Maximize2, Minimize2, X } from "lucide-react"
import { Button } from "@some-ui/shared"

type GanttHeaderProps = {
  currentTime: number
  totalDuration: number
  isExpanded: boolean
  formatTime: (seconds: number) => string
  onToggleExpand: () => void
  onToggleSubchapters: () => void
  onClose: () => void
}

export const GanttHeader = ({
  currentTime,
  totalDuration,
  isExpanded,
  formatTime,
  onToggleExpand,
  onToggleSubchapters,
  onClose,
}: GanttHeaderProps): React.JSX.Element => {
  return (
    <div className="mb-2 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Clock className="size-5 text-gray-400" />
        <span className="font-medium text-white">
          {formatTime(currentTime)}
        </span>
        <span className="text-sm text-gray-400">
          / {formatTime(totalDuration)}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="size-8 p-0 text-gray-400 hover:text-white"
          onClick={onToggleSubchapters}
          title="Toggle subchapters"
        >
          <Info className="size-4" />
          <span className="sr-only">Toggle subchapters</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="size-8 p-0 text-gray-400 hover:text-white"
          onClick={onToggleExpand}
          title={isExpanded ? "Minimize" : "Maximize"}
        >
          {isExpanded ? (
            <Minimize2 className="size-4" />
          ) : (
            <Maximize2 className="size-4" />
          )}
          <span className="sr-only">Toggle size</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="size-8 p-0 text-gray-400 hover:text-white"
          onClick={onClose}
          title="Close"
        >
          <X className="size-4" />
          <span className="sr-only">Close</span>
        </Button>
      </div>
    </div>
  )
}
