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
import { ARTIST_BADGE } from "@censor/lib/content/extract/meta"
import type { VideoId } from "@censor/types/ids"
import { asVideoId } from "@censor/types/ids"

const SHORTS_PAGE = "ytd-page-manager > ytd-shorts:not([hidden])"
const WATCH_PAGE = "ytd-page-manager > ytd-watch-flexy"
/**
 * The miniplayer plays the watch page's player over another page. YouTube
 * reflects it on the app, not on `ytd-miniplayer`.
 */
const MINIPLAYER = "ytd-app[miniplayer-is-active]"
/**
 * What the miniplayer is playing. It goes on to the next video (autoplay,
 * its own next button, the queue) without touching the hidden page, so the
 * page's `video-id` names only the video it was opened on; its title bar
 * is what follows the video playing. (A next video with the same title as
 * the page's reads as the page's.)
 */
const MINIPLAYER_TITLE = "ytd-miniplayer .ytdMiniplayerInfoBarTitle"
const PAGE_TITLE = "#title h1"

/** The page's channel: its name and badge are the lane's evidence (QD15). */
const OWNER = "ytd-video-owner-renderer"
const OWNER_NAME = `${OWNER} ytd-channel-name yt-formatted-string`

/** A reading that says nothing about the lane: nothing is read yet. */
const NO_LANE = { title: null, channelName: null, artist: false } as const

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
      ...NO_LANE,
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
    return {
      videoId,
      short: false,
      hydrated: false,
      dates: [],
      miniplayer,
      ...NO_LANE,
    }
  }
  if (miniplayer && playsAnother(doc, metadata)) {
    // Another video than the page's, which the page says nothing about.
    return {
      videoId: null,
      short: false,
      hydrated: false,
      dates: [],
      miniplayer,
      ...NO_LANE,
    }
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
  return {
    videoId,
    short: false,
    hydrated: true,
    dates,
    miniplayer,
    title: metadata.querySelector(PAGE_TITLE)?.textContent.trim() || null,
    channelName: metadata.querySelector(OWNER_NAME)?.textContent.trim() || null,
    artist: metadata.querySelector(`${OWNER} ${ARTIST_BADGE}`) !== null,
  }
}

/**
 * The miniplayer plays another video than the page's: its title bar names
 * another title. An empty bar is the page's own video, since YouTube opens
 * the miniplayer before it fills the bar in.
 */
function playsAnother(doc: Document, metadata: Element): boolean {
  const playing = doc.querySelector(MINIPLAYER_TITLE)?.textContent.trim() ?? ""
  const own = metadata.querySelector(PAGE_TITLE)?.textContent.trim()
  return playing !== "" && playing !== own
}

/**
 * The watch page's Up next list, where autoplay's next video comes from.
 * The same element in the two-column and the single-column layout.
 */
export function readUpNext(doc: Document): HTMLElement | null {
  return doc.querySelector<HTMLElement>(
    `${WATCH_PAGE} ytd-watch-next-secondary-results-renderer`
  )
}

/**
 * The shown watch page's description, where the face control goes (QD13):
 * stamped with the metadata, so it is there whenever the page is plated.
 */
export function readDescription(doc: Document): HTMLElement | null {
  return doc.querySelector<HTMLElement>(
    `${WATCH_PAGE}:not([hidden]) ytd-watch-metadata #description-inner`
  )
}

/**
 * The video an autoplay navigation goes to, or null for any other
 * navigation (#1805). YouTube's autoplay and playlist advance navigate by
 * a `yt-navigate` whose `tempData.autonav` is "1", naming the next video
 * in its endpoint; a click carries no `autonav`. The detail is the page's
 * own object, read through Firefox's `wrappedJSObject` when its Xray view
 * shows nothing.
 */
export function readAutonav(event: Event): VideoId | null {
  const waived = field(event, "wrappedJSObject")
  const detail = field(waived ?? event, "detail") ?? field(event, "detail")
  if (field(field(detail, "tempData"), "autonav") !== "1") return null
  const id = field(field(field(detail, "endpoint"), "watchEndpoint"), "videoId")
  return typeof id === "string" && id !== "" ? asVideoId(id) : null
}

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null
    ? Reflect.get(value, key)
    : undefined
}
