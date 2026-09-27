// ── Playback ──────────────────────────────────────────────────────────────────
// Source-tab side of a beat: where the drama's video is right now. Picks the
// primary <video> the same way the popup's content-scraper does — largest
// visible area, a playing video weighted ×3 — so the two agree on which video
// "the drama" is when a page carries previews or ads alongside it.

import { parseEpisode } from "@drama/logic/beats"
import type { Playback, SourceReport } from "@drama/types"

/**
 * Cost (LP3): one querySelectorAll("video") + V getBoundingClientRect calls,
 * each of which can force a layout. Runs once per GET_PLAYBACK this tab
 * answers and per hotkey beat — never on a timer (LP1).
 */
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
  const playing = !video.paused && !video.ended
  return {
    playback: playbackOf(video),
    playing,
    lastPlayAt: playedAt.get(video) ?? 0,
    // Stalled (buffering) is still "playing", but its time isn't moving.
    advancing: playing && video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA,
    rate: video.playbackRate,
    readAt: Date.now(),
  }
}

/**
 * Media events after which a source tab's report reads differently: the
 * video started, stopped, stalled, jumped, changed speed, or (a new episode)
 * changed length. `timeupdate` is left out on purpose — between these the
 * time is a straight line a display draws itself (logic/playback.ts).
 *
 *   LP1  never add `timeupdate` or `progress` here: they fire several times a
 *        second while playing, which would turn every source tab into a
 *        poller of the background (README.md → "Live playback")
 */
export const PLAYBACK_EVENTS = [
  "play",
  "playing",
  "pause",
  "waiting",
  "seeked",
  "ratechange",
  "ended",
  "durationchange",
  "emptied",
] as const
