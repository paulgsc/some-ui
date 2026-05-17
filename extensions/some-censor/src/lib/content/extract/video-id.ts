import { asVideoId } from "@censor/types/ids"
import type { VideoId } from "@censor/types/ids"

/**
 * Extract YouTube video ID from a renderer element.
 * Pure function — no side effects, no globals.
 *
 * Strategy (priority order):
 *  1. data-video-id attribute  (set after hydration — fast path)
 *  2. anchor href scan         (/watch?v=, /shorts/, /watch/)
 */
export function extractVideoId(el: HTMLElement): VideoId | null {
  const attr = el.getAttribute("data-video-id")
  if (attr) return asVideoId(attr)

  const anchors = el.querySelectorAll<HTMLAnchorElement>(
    'a#video-title, a#thumbnail, a.yt-simple-endpoint, a[href*="/watch"], a[href*="/shorts/"], a'
  )

  for (const a of anchors) {
    const href = a.href || a.getAttribute("href") || ""

    const watch = href.match(/[?&]v=([^&/#]+)/)
    if (watch) return asVideoId(watch[1])

    const shorts = href.match(/\/shorts\/([^/?#&]+)/)
    if (shorts) return asVideoId(shorts[1])

    const path = href.match(/\/watch\/([^/?#&]+)/)
    if (path) return asVideoId(path[1])
  }

  return null
}
