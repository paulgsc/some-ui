export type SubChapter = {
  id: string
  title: string
  startTime: number
  endTime: number
  description: string
  color: string
}

export type Chapter = {
  id: string
  title: string
  startTime: number
  endTime: number
  description: string
  color: string
  subChapters: Array<SubChapter>
}

export type GanttBaseProps = {
  totalDuration: number
}

export type GanttNavigationProps = {
  onJumpToTimestamp: (time: number) => void
}
