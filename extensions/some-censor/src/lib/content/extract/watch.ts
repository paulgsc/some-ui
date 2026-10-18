/**
 * The page's own video, read off the page shown (#1805): a Short, the watch
 * page, the watch page's video playing on in the miniplayer, or none. Pure
 * over the document, like the card extractors.
 *
 * The page is read from the DOM, not the URL: `ytd-page-manager` keeps a
 * page an SPA navigation left behind as a `[hidden]` child, and the one
 * child it shows is the page on screen.
 */

import type { WatchObservation } from "@censor/lib/content/core/observation"
import { asVideoId } from "@censor/types/ids"

const SHORTS_PAGE = "ytd-page-manager > ytd-shorts:not([hidden])"
const WATCH_PAGE = "ytd-page-manager > ytd-watch-flexy"
/** The miniplayer plays the watch page's player, over another page. */
const MINIPLAYER = "ytd-miniplayer[active]"

/**
 * Where the watch page states the date: the info line under the title, in
 * runs ("444M views", "21y ago"), and its tooltip, one run joined by "•"
 * ("444,875,933 views • Apr 23, 2005 • SAN DIEGO ZOO").
 */
const INFO_RUNS = "ytd-watch-info-text #info > span"
const INFO_TOOLTIP = "ytd-watch-info-text #tooltip"

export function readWatch(doc: Document): WatchObservation | null {
  if (doc.querySelector(SHORTS_PAGE) !== null) {
    return {
      videoId: null,
      short: true,
      hydrated: true,
      dates: [],
      miniplayer: false,
    }
  }
  const page = doc.querySelector(WATCH_PAGE)
  if (page === null) return null
  const miniplayer = page.hasAttribute("hidden")
  if (miniplayer && doc.querySelector(MINIPLAYER) === null) return null

  const id = page.getAttribute("video-id")
  const videoId = id === null || id === "" ? null : asVideoId(id)
  const metadata = page.querySelector("ytd-watch-metadata")
  if (videoId === null || metadata?.getAttribute("video-id") !== videoId) {
    return { videoId, short: false, hydrated: false, dates: [], miniplayer }
  }
  const dates: Array<string> = []
  for (const run of metadata.querySelectorAll(INFO_RUNS)) {
    const text = run.textContent.trim()
    if (text) dates.push(text)
  }
  const tooltip = metadata.querySelector(INFO_TOOLTIP)?.textContent ?? ""
  for (const part of tooltip.split("•")) {
    const text = part.trim()
    if (text) dates.push(text)
  }
  return { videoId, short: false, hydrated: true, dates, miniplayer }
}
