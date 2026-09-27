// ── Playback ──────────────────────────────────────────────────────────────────
// Source-tab side of a beat: where the drama's video is right now. Picks the
// primary <video> the same way the popup's content-scraper does — largest
// visible area, a playing video weighted ×3 — so the two agree on which video
// "the drama" is when a page carries previews or ads alongside it.

import { parseEpisode } from "@drama/logic/beats"
import type { Playback, SourceReport } from "@drama/types"

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

// When each video last started playing (the page's capture-phase `play`
// listener, content.ts, reports here). Weak, so a removed video is dropped.
const playedAt = new WeakMap<EventTarget, number>()

/** Record that `target` (a media element) just started playing. */
export function notePlay(target: EventTarget | null, at: number): void {
  if (target) playedAt.set(target, at)
}

function playbackOf(video: HTMLVideoElement): Playback {
  return {
    videoTime: video.currentTime,
    duration: Number.isFinite(video.duration) ? video.duration : null,
    episode: parseEpisode(document.title),
  }
}

/** Current playback of the primary video, or null when the page has none. */
export function readPlayback(): Playback | null {
  const video = primaryVideo()
  return video && playbackOf(video)
}

/**
 * This tab's answer to GET_PLAYBACK: the primary video's playback, and
 * whether *that* video is playing and when it last started — never another
 * video's, so an autoplaying ad beside a paused episode doesn't make the
 * episode's time look live. Null when the page has no video.
 */
export function readSourceReport(): SourceReport | null {
  const video = primaryVideo()
  if (!video) return null
  return {
    playback: playbackOf(video),
    playing: !video.paused && !video.ended,
    lastPlayAt: playedAt.get(video) ?? 0,
  }
}
