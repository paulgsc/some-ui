// Single source of truth for all shared types across the extension.
// No logic, no side effects — import freely from any module.

export type MoodType =
  | "joy"
  | "love"
  | "sadness"
  | "tension"
  | "cringe"
  | "neutral"

export type CardSize = "min" | "compact" | "full"

export type CardState = {
  dramaTitle: string
  posterUrl: string | null // null → placeholder emoji
  episode: string // e.g. "Ep 12 / 24"
  timestamp: string // e.g. "27:43"
  progress: number // 0–1 (position within current episode)
  overallProgress: number // 0–1 (episodes watched / total)
  rating: number // 0–10
  completionLikelihood: number // 0–1 (heuristic: will they finish?)
  activeMood: MoodType | null
  featuredQuote: string // shown in chat bubble
  emotionLabel: string // e.g. "bittersweet", "tense"
  isPlaying: boolean
}

export type CardEvents = {
  onMoodSelect: (mood: MoodType) => void
  onSizeChange: (size: CardSize) => void
  onDragEnd: (x: number, y: number) => void
}

export type DramaEntry = {
  id: string
  title: string
  episode: string
  network: string
  year: string
  genre: string
  note: string
  color: string
  addedAt: number
  // Scraped structural context frames
  posterUrl: string | null
  timestamp: string
  progress: number
  isPlaying: boolean
}

export type WatchlistState = {
  watchlist: Array<DramaEntry>
  activeId: string | null
}

export type ScrapedMeta = {
  title: string
  episode: string
  network: string
  url: string
  posterUrl: string | null
  timestamp: string
  progress: number
  isPlaying: boolean
  videoCount: number
}

export type PopupPhase =
  | { tag: "LOADING" }
  | {
      tag: "IDLE"
      state: WatchlistState
      tabId: number
      isVideoTab: boolean
      videoCount: number
    }
  | { tag: "SCRAPING"; state: WatchlistState; tabId: number }
  | {
      tag: "FORM"
      state: WatchlistState
      tabId: number
      prefill: Partial<DramaEntry>
      editId?: string
    }
  | { tag: "SAVING"; state: WatchlistState; tabId: number }
  | { tag: "ERROR"; message: string; prev: PopupPhase }

export type MessageBridge =
  | { type: "GET_STATE" }
  | { type: "SCRAPE_TAB"; tabId: number }
  | { type: "UPSERT_ENTRY"; entry: Partial<DramaEntry> & { title: string } }
  | { type: "SET_ACTIVE"; id: string }
  | { type: "REMOVE_ENTRY"; id: string }
