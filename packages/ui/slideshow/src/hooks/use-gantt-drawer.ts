import { useEffect, useState } from "react"
import type { Dispatch, SetStateAction } from "react"
import { usePeriodicOverlay } from "@slideshow/hooks/use-periodic-overlay"
import { useVideoTime } from "@slideshow/hooks/use-video-time"
import type { Chapter, SubChapter } from "@slideshow/types/gantt"
import { findCurrentChapter, formatTime } from "@slideshow/utils/gantt-utils"

type Options = {
  chapters: Array<Chapter>
  totalDuration: number
}

type ReturnOptions = {
  isExpanded: boolean
  setIsExpanded: Dispatch<SetStateAction<boolean>>
  showSubchapters: boolean
  setShowSubchapters: Dispatch<SetStateAction<boolean>>
  currentChapter: Chapter | SubChapter | undefined
  currentTime: number
  showOverlay: boolean
  setShowOverlay: Dispatch<SetStateAction<boolean>>
  totalDuration: number
  jumpToTimestamp: (time: number) => void
  mouseHandlers: { onMouseEnter: () => void; onMouseLeave: () => void }
  formatTime: (seconds: number) => string
}
export function useGanttDrawer({
  chapters,
  totalDuration,
}: Options): ReturnOptions {
  const [isExpanded, setIsExpanded] = useState<boolean>(true)
  const [showSubchapters, setShowSubchapters] = useState<boolean>(true)
  const [currentChapter, setCurrentChapter] = useState<
    Chapter | SubChapter | undefined
  >(chapters[0])

  const { currentTime, setCurrentTime } = useVideoTime({ totalDuration })
  const { showOverlay, setShowOverlay, mouseHandlers } = usePeriodicOverlay()

  useEffect(() => {
    if (chapters.length === 0 || currentChapter === undefined) return
    const chapter = findCurrentChapter(currentTime, chapters)
    if (chapter && chapter.id !== currentChapter.id) {
      setCurrentChapter(chapter)
    }
  }, [currentTime, currentChapter?.id])

  const jumpToTimestamp = (time: number): void => {
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
