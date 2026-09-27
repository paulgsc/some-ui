// ── Source election ───────────────────────────────────────────────────────────
// Which tab's video a beat is timed against. Nothing is registered or
// remembered: each time a display tab needs the video time, the background
// asks every open tab on a marked site and picks from their answers here. A
// tab that closed, navigated off the site, or had its site unmarked simply
// isn't asked (or, as a display tab, doesn't answer), so there is no stale
// source to notice and nothing to hand over. Pure — no DOM or browser globals.

import type { Playback, SourceReport } from "@drama/types"

/**
 * The drama's playback among the source tabs' reports: a playing video over a
 * paused one, then the tab that started playing most recently (two playing
 * tabs — the newer one is what the user just turned to).
 */
export function pickSource(
  reports: ReadonlyArray<SourceReport>
): Playback | null {
  let best: SourceReport | null = null
  for (const report of reports) {
    if (
      best === null ||
      (report.playing && !best.playing) ||
      (report.playing === best.playing && report.lastPlayAt > best.lastPlayAt)
    ) {
      best = report
    }
  }
  return best?.playback ?? null
}
