/**
 * The watch page's hold (#1805, QD11, QD17): what the Actuator writes for
 * the page's own video, one module because every write here is page-wide.
 *
 * - The view goes on `<html>` as `data-boyo-watch`; `content.css` hides the
 *   player, the miniplayer and what is said about the video until it reads
 *   `plated`, and the whole page on `absent`.
 * - On `absent`, "Not here." and a Back button, built here, unless the video
 *   is in the miniplayer over another page.
 * - Until `plated`, no media plays, and the tab title is not the video's.
 *
 * Those last two are holds YouTube would undo, so this is the one place the
 * Actuator reads the page: it finds the media playing when the hold goes up,
 * pauses each `play` as it starts, and replaces each title YouTube writes.
 * It decides nothing, and nothing it reads becomes an input for Core; what
 * it keeps is what it overwrote (the media it paused, the title it
 * replaced), to give back on `plated`.
 *
 *   WH1 — Idempotent: realizing the same view twice writes nothing new.
 *   WH2 — Total cleanup: `null` and `dispose` leave no attribute, surface,
 *         listener or observer; only `dispose` gives back a title, the one
 *         the page still shows.
 */

import type { WatchView } from "@censor/lib/content/fsm"
import type { VideoId } from "@censor/types/ids"

/** The tab title while the video is held: the site's, never the video's. */
export const NEUTRAL_TITLE = "YouTube"

export type WatchHold = {
  realize(
    view: WatchView | null,
    videoId: VideoId | null,
    miniplayer: boolean
  ): void
  dispose(): void
}

export function createWatchHold(doc: Document): WatchHold {
  let current: WatchView | null = null
  let currentVideo: VideoId | null = null
  let currentMiniplayer = false
  let surface: HTMLElement | null = null
  let guard: AbortController | null = null
  let titleObserver: MutationObserver | null = null
  /** The title the hold replaced, given back on `plated`. */
  let vendorTitle: string | null = null
  /** Media the hold paused, played again on `plated`. */
  let paused = new Set<HTMLMediaElement>()

  function holdTitle(): void {
    if (doc.title === NEUTRAL_TITLE) return
    vendorTitle = doc.title
    doc.title = NEUTRAL_TITLE
  }

  function pause(media: HTMLMediaElement): void {
    if (media.paused) return
    media.pause()
    paused.add(media)
  }

  function startHold(): void {
    if (guard !== null) return
    guard = new AbortController()
    doc.addEventListener(
      "play",
      (event) => {
        if (event.target instanceof HTMLMediaElement) pause(event.target)
      },
      { capture: true, signal: guard.signal }
    )
    for (const media of doc.querySelectorAll<HTMLMediaElement>("video, audio"))
      pause(media)
    holdTitle()
    // Lifetime: disconnected by stopHold(), on `plated`, `null` and dispose.
    titleObserver = new MutationObserver(holdTitle)
    titleObserver.observe(doc.head, {
      childList: true,
      subtree: true,
      characterData: true,
    })
  }

  function stopHold(): void {
    guard?.abort()
    guard = null
    titleObserver?.disconnect()
    titleObserver = null
  }

  function showSurface(): void {
    if (surface !== null) return
    surface = doc.createElement("div")
    surface.dataset["boyoNotHere"] = ""
    const line = doc.createElement("p")
    line.textContent = "Not here."
    const back = doc.createElement("button")
    back.type = "button"
    back.textContent = "Back"
    // The button's own listener: it goes with the button.
    back.addEventListener("click", () => {
      const win = doc.defaultView
      if (win === null) return
      if (win.history.length > 1) win.history.back()
      else win.location.assign("/")
    })
    surface.append(line, back)
    doc.body.append(surface)
  }

  function hideSurface(): void {
    surface?.remove()
    surface = null
  }

  /** Give back what the hold took, for the video it took it from. */
  function release(): void {
    stopHold()
    if (vendorTitle !== null && doc.title === NEUTRAL_TITLE) {
      doc.title = vendorTitle
    }
    vendorTitle = null
    for (const media of paused) {
      if (media.isConnected) void media.play().catch(() => undefined)
    }
    paused = new Set()
  }

  /** Forget what the hold took: it belongs to a page no longer shown. */
  function forget(): void {
    stopHold()
    vendorTitle = null
    paused = new Set()
  }

  function realize(
    view: WatchView | null,
    videoId: VideoId | null,
    miniplayer: boolean
  ): void {
    if (
      view === current &&
      videoId === currentVideo &&
      miniplayer === currentMiniplayer
    ) {
      return
    }
    // Another video's title and media are not this one's to give back.
    if (videoId !== currentVideo) {
      vendorTitle = null
      paused = new Set()
    }
    current = view
    currentVideo = videoId
    currentMiniplayer = miniplayer
    const root = doc.documentElement
    if (view === null) {
      delete root.dataset["boyoWatch"]
      hideSurface()
      forget()
      return
    }
    root.dataset["boyoWatch"] = view
    if (view === "plated") {
      hideSurface()
      release()
      return
    }
    startHold()
    if (view === "absent" && !miniplayer) showSurface()
    else hideSurface()
  }

  return {
    realize,
    dispose(): void {
      // Off is plain YouTube: the shown page's own title comes back.
      const title = vendorTitle
      realize(null, null, false)
      if (title !== null && doc.title === NEUTRAL_TITLE) doc.title = title
    },
  }
}
