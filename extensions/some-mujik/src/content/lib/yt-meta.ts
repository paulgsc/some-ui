// ─── YouTube Metadata Extraction ─────────────────────────────────────────────
// Extracts currently playing song info from YouTube Music / YouTube DOM.
// Returns null if not on a video page or video not playing.

export type YTMetadata = {
  title: string
  artist: string
  videoId: string
  thumbnailUrl: string
  currentTime: number
  duration: number
}

function getVideoId(): string | null {
  try {
    return new URL(window.location.href).searchParams.get("v")
  } catch {
    return null
  }
}

export function extractMetadata(): YTMetadata | null {
  const videoId = getVideoId()
  if (!videoId) return null

  const video = document.querySelector<HTMLVideoElement>("video")
  if (!video || video.paused || video.ended || video.readyState < 2) return null

  // Title — try YouTube Music first, then standard YT
  const titleEl =
    document.querySelector<HTMLElement>(
      "yt-formatted-string.ytmusic-player-bar"
    ) ||
    document.querySelector<HTMLElement>(".title.ytmusic-player-bar") ||
    document.querySelector<HTMLElement>(
      "h1.ytd-watch-metadata yt-formatted-string"
    ) ||
    document.querySelector<HTMLElement>("#title h1 yt-formatted-string") ||
    document.querySelector<HTMLElement>(".watch-title")

  const title =
    titleEl?.textContent?.trim() ||
    document.title
      .replace(/\s*[-–|]?\s*(YouTube Music|YouTube)\s*$/, "")
      .trim() ||
    "Unknown Title"

  // Artist / channel
  const artistEl =
    document.querySelector<HTMLElement>(".byline.ytmusic-player-bar a") ||
    document.querySelector<HTMLElement>(
      "yt-formatted-string.byline.ytmusic-player-bar"
    ) ||
    document.querySelector<HTMLElement>("#channel-name a") ||
    document.querySelector<HTMLElement>(".ytd-channel-name a") ||
    document.querySelector<HTMLElement>("#owner-text a")

  const artist = artistEl?.textContent?.trim() || "Unknown Artist"

  return {
    title,
    artist,
    videoId,
    thumbnailUrl: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
    currentTime: Math.floor(video.currentTime),
    duration: Math.floor(video.duration) || 0,
  }
}

export function isVideoPlaying(): boolean {
  const v = document.querySelector<HTMLVideoElement>("video")
  return !!v && !v.paused && !v.ended && v.readyState > 2
}
