// ── Live playback ─────────────────────────────────────────────────────────────
// Where the drama is *now*, from the last report the source tab sent. The
// source tab reports only when its video changes state (play, pause, seek,
// rate); in between, the time is a straight line from the report, so a
// display runs the clock itself instead of anyone polling the video. Pure —
// no DOM or browser globals.

import { normalizeEpisode } from "@drama/logic/beats"
import type { SourceReport } from "@drama/types"

export type LivePosition = {
  episode: string // normalized; "" when the source page title has none
  videoTime: number
  progress: number // 0–1; 0 while the duration is unknown
  timestamp: string
}

/** Seconds as the card shows them: "mm:ss", or "h:mm:ss" past an hour. */
export function formatTimestamp(secs: number): string {
  if (!Number.isFinite(secs) || secs <= 0) return "00:00"
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = Math.floor(secs % 60)
  const pad = (n: number): string => String(n).padStart(2, "0")
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

/** Where `report`'s video is at `now` (epoch ms). */
export function livePosition(report: SourceReport, now: number): LivePosition {
  const { videoTime, duration, episode } = report.playback
  const elapsed = report.advancing
    ? (Math.max(0, now - report.readAt) / 1000) * report.rate
    : 0
  const time =
    duration !== null && duration > 0
      ? Math.min(videoTime + elapsed, duration)
      : videoTime + elapsed
  return {
    episode: episode ? normalizeEpisode(episode) : "",
    videoTime: time,
    progress: duration !== null && duration > 0 ? time / duration : 0,
    timestamp: formatTimestamp(time),
  }
}
