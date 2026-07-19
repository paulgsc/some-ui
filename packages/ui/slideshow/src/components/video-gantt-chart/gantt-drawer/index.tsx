import type { FC } from "react"
import { GanttToast } from "@slideshow/components/video-gantt-chart/gantt-burst-notification"
import { GanttFooter } from "@slideshow/components/video-gantt-chart/gantt-footer"
import { GanttHeader } from "@slideshow/components/video-gantt-chart/gantt-header"
import { GanttTimeline } from "@slideshow/components/video-gantt-chart/gantt-timeline"
import { useGanttDrawer } from "@slideshow/hooks/use-gantt-drawer"
import type { Chapter } from "@slideshow/types/gantt"
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
} from "some-ui-shared"
import { cn } from "some-ui-utils"

type GanttDrawerProps = {
  chapters: Array<Chapter>
  totalDuration: number
  className?: string
}

const notifications = [
  {
    id: 1,
    title: "New message",
    description: "You have received a new message from Sarah",
  },
  {
    id: 2,
    title: "Payment successful",
    description: "Your payment has been processed",
  },
  {
    id: 3,
    title: "Update available",
    description: "A new version is ready to install",
  },
  {
    id: 4,
    title: "Calendar reminder",
    description: "Meeting with team in 15 minutes",
  },
  {
    id: 5,
    title: "Upload complete",
    description: "Your file has been uploaded successfully",
  },
]

export const GanttDrawer: FC<GanttDrawerProps> = ({
  chapters,
  totalDuration,
  className,
}) => {
  const {
    isExpanded,
    setIsExpanded,
    showSubchapters,
    setShowSubchapters,
    currentChapter,
    currentTime,
    showOverlay,
    setShowOverlay,
    mouseHandlers,
    jumpToTimestamp,
    formatTime,
  } = useGanttDrawer({ chapters, totalDuration })

  if (chapters.length <= 0 || currentChapter === undefined) return null

  return (
    <Drawer open={showOverlay} onOpenChange={() => {}} {...mouseHandlers}>
      <DrawerContent className="absolute bg-black">
        <div className={cn("mx-auto w-full", className)}>
          <DrawerHeader>
            <GanttHeader
              currentTime={currentTime}
              totalDuration={totalDuration}
              isExpanded={isExpanded}
              formatTime={formatTime}
              onToggleExpand={() => setIsExpanded(!isExpanded)}
              onToggleSubchapters={() => setShowSubchapters(!showSubchapters)}
              onClose={() => setShowOverlay(false)}
            />
          </DrawerHeader>
          <GanttTimeline
            chapters={chapters}
            totalDuration={totalDuration}
            currentTime={currentTime}
            showSubchapters={showSubchapters}
            formatTime={formatTime}
            onJumpToTimestamp={jumpToTimestamp}
          />

          <DrawerFooter>
            <GanttFooter
              currentChapter={currentChapter}
              onJumpToTimestamp={jumpToTimestamp}
            />
          </DrawerFooter>
        </div>
      </DrawerContent>
      {showOverlay && (
        <GanttToast notifications={notifications} isPlaying={true} />
      )}
    </Drawer>
  )
}
