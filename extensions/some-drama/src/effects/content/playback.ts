// ── Playback ──────────────────────────────────────────────────────────────────
// Source-tab side of a beat: where the drama's video is right now. Picks the
// primary <video> the same way the popup's content-scraper does — largest
// visible area, a playing video weighted ×3 — so the two agree on which video
// "the drama" is when a page carries previews or ads alongside it.

import { parseEpisode } from "@drama/logic/beats"
import type { Playback } from "@drama/types"

function primaryVideo(): HTMLVideoElement | null {
  let best: HTMLVideoElement | null = null
  let bestScore = 0
  for (const video of document.querySelectorAll("video")) {
    const rect = video.getBoundingClientRect()
    let score = rect.width * rect.height
    if (video.currentTime > 0 && !video.paused && !video.ended) score *= 3
    if (score > bestScore) {
      best = video
      bestScore = score
    }
  }
  return best
}

/** Current playback of the primary video, or null when the page has none. */
export function readPlayback(): Playback | null {
  const video = primaryVideo()
  if (!video) return null
  return {
    videoTime: video.currentTime,
    duration: Number.isFinite(video.duration) ? video.duration : null,
    episode: parseEpisode(document.title),
  }
}
