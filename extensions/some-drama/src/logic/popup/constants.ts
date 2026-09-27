// Streaming hosts the popup treats as a watch tab (banner + "Extract Tab
// Context"). Matches the platforms content-scraper.ts's networkSelector names;
// subdomains match too (see isVideoHost).
export const VIDEO_HOSTS: Array<string> = [
  "netflix.com",
  "viki.com",
  "youtube.com",
  "crunchyroll.com",
]

export const MAX_WATCHLIST = 5

export const POPUP_WIDTH_PX = 340

export const ACCENT_COLORS = [
  "#ff6b6b", // Coral Red
  "#f97316", // Amber Orange
  "#facc15", // Cyber Yellow
  "#4ade80", // Emerald Green
  "#22d3ee", // Electric Cyan
  "#818cf8", // Indigo Pastel
  "#e879f9", // Orchid Violet
  "#fb7185", // Rose Quartz
] as const

export const DEFAULT_ACCENT = ACCENT_COLORS[0]
