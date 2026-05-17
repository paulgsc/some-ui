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
  posterUrl: string | null
  episode: string
  timestamp: string
  progress: number
  overallProgress: number
  rating: number
  completionLikelihood: number
  activeMood: MoodType | null
  featuredQuote: string
  emotionLabel: string
  isPlaying: boolean
}

export type CardEvents = {
  onMoodSelect: (mood: MoodType) => void
  onSizeChange: (size: CardSize) => void
  onDragEnd: (x: number, y: number) => void
}

// ─── Structural: factual / scrapable metadata ─────────────────────────────────
export type DramaEntryStructural = {
  title: string
  episode: string
  network: string
  year: string
  genre: string
  note: string
  color: string
  url: string // source URL — scrapable from window.location.href
  posterUrl: string | null
  timestamp: string
  progress: number
  isPlaying: boolean
}

// ─── Opinionated: ephemeral, feeling-at-the-moment values ────────────────────
export type DramaEntryOpinionated = {
  rating: number // 0–10
  completionLikelihood: number // 0–1
  activeMood: MoodType | null
  featuredQuote: string
  emotionLabel: string
  overallProgress: number // 0–1  (episodes watched / total, user-tracked)
}

// ─── Full entry ───────────────────────────────────────────────────────────────
export type DramaEntry = {
  id: string
  addedAt: number
} & DramaEntryStructural &
  DramaEntryOpinionated

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
  | { type: "SAVE_MOMENT"; payload: MomentRecord }

export type MomentRecord = {
  id: string
  timestamp: number
  mood: MoodType
  episodeId: string
  dramaTitle: string
  capturedAt: number
}
