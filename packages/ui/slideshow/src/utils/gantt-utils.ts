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
  chapters: Array<Chapter>
): Chapter | SubChapter {
  const firstChapter = chapters[0]
  if (!firstChapter) {
    throw new Error("Chapters array must not be empty")
  }

  for (const chapter of chapters) {
    if (time >= chapter.startTime && time < chapter.endTime) {
      // Check subchapters if they exist
      if (chapter.subChapters.length > 0) {
        for (const subChapter of chapter.subChapters) {
          if (time >= subChapter.startTime && time < subChapter.endTime) {
            return subChapter
          }
        }
      }
      return chapter
    }
  }

  // Default to first chapter if time is before the first chapter or after the last
  return firstChapter
}
