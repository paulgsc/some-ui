/**
 * The crawl's inputs, assembled from the extension's own catalogue (BC1,
 * #1434) — shared by `scripts/crawl-layout.ts`, which runs the fingerprint
 * inside a real browser, and `layout.test.ts`, which runs it over the same
 * fixtures under jsdom and checks the checked-in table still matches.
 *
 * Pure data. Kept apart from `fingerprint.ts` so that module can stay
 * closure-free and serializable for `page.evaluate()`.
 */

import {
  VIDEO_LINK_SELECTOR,
  VIDEO_SELECTORS,
} from "@censor/lib/content/selectors"

import { FIELD_SELECTORS } from "./fields"
import type { FingerprintInput } from "./fingerprint"
import type { BoyoSurface } from "./surface"

export function fingerprintInput(
  surface: BoyoSurface | "*",
  path: string
): FingerprintInput {
  return {
    surface,
    path,
    tags: VIDEO_SELECTORS,
    videoLink: VIDEO_LINK_SELECTOR,
    fields: FIELD_SELECTORS,
  }
}

/** One page the crawler visits. */
export type CrawlTarget = {
  readonly surface: BoyoSurface
  /** Path only — never a query string in the checked-in table (#1382). */
  readonly path: string
  /** What to actually load: a fixture file name, or a live URL. */
  readonly load: string
}

/**
 * The e2e fixtures, as crawl targets. They are YouTube-shaped by construction
 * (`tests/e2e/fixtures/*.html` document what real markup they mirror), and
 * they are the only pages reachable from an offline environment.
 */
export const FIXTURE_TARGETS: ReadonlyArray<CrawlTarget> = [
  { surface: "home", path: "/", load: "yt-home.html" },
  { surface: "watch", path: "/watch", load: "yt-watch.html" },
]

/**
 * Live pages, one per surface the catalogue is known to appear on. Paths
 * carry a query string only where YouTube needs one to render the surface
 * at all; the table records `path` alone.
 */
export const LIVE_TARGETS: ReadonlyArray<CrawlTarget> = [
  { surface: "home", path: "/", load: "https://www.youtube.com/" },
  {
    surface: "search",
    path: "/results",
    load: "https://www.youtube.com/results?search_query=documentary",
  },
  {
    surface: "watch",
    path: "/watch",
    load: "https://www.youtube.com/watch?v=jNQXAC9IVRw",
  },
  {
    surface: "shorts",
    path: "/shorts/",
    load: "https://www.youtube.com/shorts",
  },
  {
    surface: "playlist",
    path: "/playlist",
    load: "https://www.youtube.com/playlist?list=PLbpi6ZahtOH6Bd7_OINqmY5-4xVzoEeQA",
  },
  { surface: "channel", path: "/@", load: "https://www.youtube.com/@YouTube" },
  {
    surface: "subscriptions",
    path: "/feed/subscriptions",
    load: "https://www.youtube.com/feed/subscriptions",
  },
]
