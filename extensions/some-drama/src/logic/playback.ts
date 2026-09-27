// ── Live playback ─────────────────────────────────────────────────────────────
// Where the drama is *now*, from the last report the source tab sent. The
// source tab reports only when its video changes state (play, pause, seek,
// rate); in between, the time is a straight line from the report, so a
// display runs the clock itself instead of anyone polling the video. Pure —
// no DOM or browser globals.
//
// Why each piece is here rather than inline: `predicts` and `livePublisher`
// are the rule that keeps broadcasts to changes a display couldn't have
// predicted, and being pure they are tested (__tests__/playback.test.ts).
// Loosening either one — dropping a field from `predicts`, widening
// DRIFT_TOLERANCE_S so a seek slips through, sending on every call — fails
// those tests. That background.ts routes through the publisher is LP2
// (README.md → "Live playback: what is enforced, and what is not").

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

// ── Publishing ────────────────────────────────────────────────────────────────

/** How far (s) a display's clock may drift before a report is worth sending. */
export const DRIFT_TOLERANCE_S = 1

/**
 * Whether a display running the clock from `prev` already shows what `next`
 * says: the same episode and length, still moving (or still stopped) at the
 * same rate, and within DRIFT_TOLERANCE_S of where the clock puts it. Which
 * tab sent it doesn't matter — only what the display would show.
 */
export function predicts(
  prev: SourceReport | null,
  next: SourceReport | null
): boolean {
  if (prev === null || next === null) return prev === next
  const a = prev.playback
  const b = next.playback
  if (a.episode !== b.episode || a.duration !== b.duration) return false
  if (prev.advancing !== next.advancing || prev.rate !== next.rate) return false
  const drift = livePosition(prev, next.readAt).videoTime - b.videoTime
  return Math.abs(drift) <= DRIFT_TOLERANCE_S
}

/**
 * The background's LIVE_PLAYBACK publisher. Each call asks the source tabs
 * (`ask`) and sends the elected report (`send`) only when the last report
 * *sent* no longer predicts it — a seek, a pause, a new episode, the source
 * going away. An event from a tab that isn't the drama's, or a tab closing,
 * costs the asking and nothing more. Calls run one at a time, in order, so an
 * older election can't land after a newer one.
 *
 * Kept here, pure, so the rule is tested (logic/__tests__/playback.test.ts)
 * rather than trusted; background.ts only wires it (invariant LP2, README).
 */
export function livePublisher(
  ask: () => Promise<SourceReport | null>,
  send: (live: SourceReport | null) => Promise<void>
): () => Promise<void> {
  // The baseline is the last report sent, since that is what displays
  // extrapolate from. `undefined`: nothing sent yet, or the background was
  // evicted — what displays show is unknown, so the next report always goes.
  let sent: SourceReport | null | undefined = undefined
  let tail: Promise<unknown> = Promise.resolve()
  return () => {
    const run = tail.then(async () => {
      const live = await ask()
      if (sent !== undefined && predicts(sent, live)) return
      sent = live
      await send(live)
    })
    tail = run.catch(() => undefined)
    return run
  }
}
