// Shared fixtures for the lifetime suites: one active drama, its card state,
// and the content stylesheet as it ships (the raw CSS the build concatenates).

import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import type {
  CardEvents,
  CardState,
  DramaEntry,
  SourceReport,
  WatchlistState,
} from "@drama/types"
import { CONTENT_SOURCES } from "@drama/uno.sources"

const ROOT = resolve(import.meta.dirname, "../..")

/** The content sheet's raw CSS, in the order the build concatenates it. */
export const CONTENT_CSS = CONTENT_SOURCES.filter((p) => p.endsWith(".css"))
  .map((p) => readFileSync(resolve(ROOT, p), "utf8"))
  .join("\n")

/** The card's dormant gate: the root while minimised or hidden. */
export const DORMANT_GATE = "#dc-root.dc-dormant"

export const ENTRY: DramaEntry = {
  id: "d1",
  addedAt: 0,
  title: "Queen of Tears",
  episode: "Ep 12",
  network: "tvN",
  year: "2024",
  genre: "",
  note: "",
  color: "",
  url: "",
  posterUrl: null,
  timestamp: "00:00",
  progress: 0.4,
  isPlaying: true,
  rating: 8,
  completionLikelihood: 0.9,
  activeMood: null,
  featuredQuote: "",
  emotionLabel: "",
  overallProgress: 0.7,
  axes: { connection: 20, hope: -10, trust: 0, control: 5 },
  transition: { before: "", after: "" },
  tags: [],
  peakLine: "",
  momentum: { value: 50, direction: "steady" },
}

export const STATE: WatchlistState = {
  watchlist: [ENTRY],
  activeId: ENTRY.id,
  streamSites: [],
}

export const CARD_STATE: CardState = {
  dramaTitle: ENTRY.title,
  posterUrl: null,
  episode: ENTRY.episode,
  timestamp: ENTRY.timestamp,
  progress: ENTRY.progress,
  overallProgress: ENTRY.overallProgress,
  rating: ENTRY.rating,
  completionLikelihood: ENTRY.completionLikelihood,
  activeMood: null,
  featuredQuote: "",
  emotionLabel: "",
  isPlaying: true,
  axes: ENTRY.axes,
  transition: ENTRY.transition,
  tags: ENTRY.tags,
  peakLine: ENTRY.peakLine,
  momentum: ENTRY.momentum,
}

export const NO_EVENTS: CardEvents = {
  onMoodSelect: () => {},
  onVerdict: () => {},
  onSizeChange: () => {},
  onDragEnd: () => {},
}

/** Resolve after the next animation frame (the card's entrance runs on one). */
export const nextFrame = (): Promise<void> =>
  new Promise((r) => requestAnimationFrame(() => r()))

export function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, "visibilityState", {
    value: state,
    configurable: true,
  })
  document.dispatchEvent(new Event("visibilitychange"))
}

/** The source tab's report: the drama `videoTime` s in, as of `readAt`. */
export function sourceReport(
  videoTime: number,
  advancing: boolean,
  readAt = Date.now()
): SourceReport {
  return {
    playback: { videoTime, duration: 3600, episode: "Ep 13" },
    playing: advancing,
    lastPlayAt: 0,
    advancing,
    rate: 1,
    readAt,
  }
}
