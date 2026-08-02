import type { Chapter, SubChapter } from "@slideshow/types/gantt"
import { Button } from "@some-ui/shared"
import { Play } from "lucide-react"
import { cn } from "some-ui-utils"

type GanttFooterProps = {
  currentChapter: Chapter | SubChapter
  onJumpToTimestamp: (time: number) => void
}

export const GanttFooter = ({
  currentChapter,
  onJumpToTimestamp,
}: GanttFooterProps): React.JSX.Element => {
  return (
    <div className="mt-1 flex animate-pulse items-center gap-2 text-sm">
      <div
        className={cn(
          "size-3 rounded-full",

          {
            [currentChapter.color]: !!currentChapter.color,
          }
        )}
      />
      <span className="text-white">{currentChapter.title}</span>
      <span className="text-xs text-gray-400">
        {currentChapter.description}
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="ml-auto h-6 gap-1 px-2 text-xs text-gray-400 hover:text-white"
        onClick={() => onJumpToTimestamp(currentChapter.startTime || 0)}
      >
        <Play className="size-3" />
        <span>Replay section</span>
      </Button>
    </div>
  )
}
