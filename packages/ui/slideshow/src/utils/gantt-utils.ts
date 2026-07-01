import type { Chapter, SubChapter } from "@slideshow/types/gantt"

export function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`
}

export function findCurrentChapter(
  time: number,
  chapters: Array<any>
): Chapter | SubChapter {
  // First check main chapters
  for (const chapter of chapters) {
    if (time >= chapter.startTime && time < chapter.endTime) {
      // Then check subchapters if any
      if (chapter.subChapters) {
        for (const subChapter of chapter.subChapters) {
          if (time >= subChapter.startTime && time < subChapter.endTime) {
            return subChapter
          }
        }
      }
      return chapter
    }
  }
  return chapters[0] // Default to first chapter
}
