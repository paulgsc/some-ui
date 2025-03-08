import { useEffect, useState } from "react"
import { usePeriodicOverlay } from "@slideshow/hooks/use-periodic-overlay"
import { useVideoTime } from "@slideshow/hooks/use-video-time"
import type { Chapter, SubChapter } from "@slideshow/types/gantt"
import { findCurrentChapter, formatTime } from "@slideshow/utils/gantt-utils"

type Options = {
  chapters: Array<Chapter>
  totalDuration: number
}
export function useGanttDrawer({ chapters, totalDuration }: Options) {
  const [isExpanded, setIsExpanded] = useState(true)
  const [showSubchapters, setShowSubchapters] = useState(true)
  const [currentChapter, setCurrentChapter] = useState<Chapter | SubChapter>(
    chapters[0]
  )

  const { currentTime, setCurrentTime } = useVideoTime({ totalDuration })
  const { showOverlay, setShowOverlay, mouseHandlers } = usePeriodicOverlay()

  useEffect(() => {
    const chapter = findCurrentChapter(currentTime, chapters)
    if (chapter && chapter.id !== currentChapter.id) {
      setCurrentChapter(chapter)
    }
  }, [currentTime, currentChapter.id])

  const jumpToTimestamp = (time: number) => {
    setCurrentTime(time)
  }

  return {
    isExpanded,
    setIsExpanded,
    showSubchapters,
    setShowSubchapters,
    currentChapter,
    currentTime,
    totalDuration,
    showOverlay,
    setShowOverlay,
    mouseHandlers,
    jumpToTimestamp,
    formatTime,
  }
}
