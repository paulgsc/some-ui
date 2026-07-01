import type { EventType, ExistingChapter } from "@input/types/timeline-events"

export const generateUID = (): string => {
  return `chapter_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

export const getCurrentTimestamp = (): number => {
  return Date.now()
}

export const validateAndParseJson = (jsonString: string): any => {
  try {
    return JSON.parse(jsonString)
  } catch (e) {
    throw new Error(
      `Invalid JSON: ${e instanceof Error ? e.message : "Unknown error"}`
    )
  }
}

export const getEventRequirements = (
  eventType: EventType
): {
  needsUID: boolean
  needsContext: boolean
  needsTimestamp: boolean
  needsPayload: boolean
  needsFinalPayload: boolean
} => {
  return {
    needsUID: eventType !== "ClearAll",
    needsContext: eventType === "StartChapter" || eventType === "UpdateContext",
    needsTimestamp: [
      "StartChapter",
      "EndChapter",
      "ExtendChapter",
      "CompleteChapter",
    ].includes(eventType),
    needsPayload: ["StartChapter", "UpdatePayload", "CompleteChapter"].includes(
      eventType
    ),
    needsFinalPayload: eventType === "EndChapter",
  }
}

// Mock existing chapters data - in real app this would come from API
export const mockExistingChapters: Array<ExistingChapter> = [
  {
    uid: "intro_2024_001",
    title: "Stream Introduction",
    start_time: 1704067200000,
    end_time: 1704067230000,
    is_active: false,
    tags: { phase: "opening", type: "intro" },
  },
  {
    uid: "coding_session_rust_001",
    title: "Coding Session: Rust & WebAssembly",
    start_time: 1704067230000,
    is_active: true,
    tags: { topic: "rust", tech: "wasm", difficulty: "intermediate" },
  },
  {
    uid: "qa_interactive_001",
    title: "Q&A Session",
    start_time: 1704067290000,
    end_time: 1704067320000,
    is_active: false,
    tags: { type: "interactive", engagement: "high" },
  },
  {
    uid: "break_short_001",
    title: "Short Break",
    start_time: 1704067320000,
    end_time: 1704067330000,
    is_active: false,
    tags: { type: "intermission" },
  },
  {
    uid: "deep_dive_async_001",
    title: "Deep Dive: Rust Async",
    start_time: 1704067330000,
    is_active: true,
    tags: { topic: "rust", tech: "async", difficulty: "advanced" },
  },
]

export const searchExistingChapters = (
  query: string
): Array<ExistingChapter> => {
  if (!query.trim()) return mockExistingChapters

  const lowercaseQuery = query.toLowerCase()
  return mockExistingChapters.filter(
    (chapter) =>
      chapter.uid.toLowerCase().includes(lowercaseQuery) ||
      chapter.title.toLowerCase().includes(lowercaseQuery) ||
      Object.values(chapter.tags).some((tag) =>
        tag.toLowerCase().includes(lowercaseQuery)
      )
  )
}

export const getChapterByUID = (uid: string): ExistingChapter | undefined => {
  return mockExistingChapters.find((chapter) => chapter.uid === uid)
}
