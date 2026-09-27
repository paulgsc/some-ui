import { sendMsg } from "@drama/effects/messaging"
import { isStreamSite, siteOf } from "@drama/logic/stream-sites"
import type { DramaEntry, PopupPhase, WatchlistState } from "@drama/types"

// Statically import the scraper function using modern ES module syntax
import { scrapeActiveTabMedia } from "./content-scraper"

export class PopupStateMachine {
  private currentPhase: PopupPhase = { tag: "LOADING" }
  private subscriber: (phase: PopupPhase) => void

  constructor(onTransition: (phase: PopupPhase) => void) {
    this.subscriber = onTransition
  }

  public getPhase(): PopupPhase {
    return this.currentPhase
  }

  public transition(next: PopupPhase): void {
    this.currentPhase = next
    this.subscriber(this.currentPhase)
  }

  public async boot(): Promise<void> {
    this.transition({ tag: "LOADING" })
    try {
      const [stateResp, tabs] = await Promise.all([
        sendMsg({ type: "GET_STATE" }),
        browser.tabs.query({ active: true, currentWindow: true }),
      ])

      if (!stateResp.ok)
        throw new Error(
          "Failed to load backend state synchronization frameworks",
          { cause: stateResp.error }
        )

      const [{ id: tabId = -1, url: tabUrl = "" } = {}] = tabs
      this.transition(await idlePhase(stateResp.state, tabId, tabUrl))
    } catch (err) {
      this.transition({
        tag: "ERROR",
        message: String(err),
        prev: this.currentPhase,
      })
    }
  }

  public async triggerScrape(
    state: WatchlistState,
    tabId: number
  ): Promise<void> {
    this.transition({ tag: "SCRAPING", state, tabId })
    try {
      // Stringify the statically imported function directly.
      // Vite preserves the function structure, making this clean and type-safe.
      const results = await browser.tabs.executeScript(tabId, {
        code: `(${scrapeActiveTabMedia.toString()})()`,
      })

      const data = results[0]
      this.transition({
        tag: "FORM",
        state,
        tabId,
        prefill: {
          title: data?.title || "",
          episode: data?.episode || "",
          network: data?.network || "",
          posterUrl: data?.posterUrl || null,
          timestamp: data?.timestamp || "00:00",
          progress: data?.progress || 0,
          isPlaying: data?.isPlaying || false,
        },
      })
    } catch (err) {
      this.transition({
        tag: "FORM",
        state,
        tabId,
        prefill: { note: `Heuristic parsing suspended: ${String(err)}` },
      })
    }
  }

  public async saveEntry(
    entry: Partial<DramaEntry> & { title: string },
    state: WatchlistState,
    tabId: number
  ): Promise<void> {
    this.transition({ tag: "SAVING", state, tabId })
    try {
      const resp = await sendMsg({
        type: "UPSERT_ENTRY",
        entry,
      })

      if (!resp.ok)
        throw new Error("Failed to save Entry", { cause: resp.error })

      void this.reloadToIdle(tabId)
    } catch (err) {
      this.transition({
        tag: "ERROR",
        message: String(err),
        prev: this.currentPhase,
      })
    }
  }

  public async setActive(id: string, tabId: number): Promise<void> {
    try {
      const resp = await sendMsg({
        type: "SET_ACTIVE",
        id,
      })
      if (!resp.ok)
        throw new Error("Failed to setActive", { cause: resp.error })

      void this.reloadToIdle(tabId)
    } catch (err) {
      this.transition({
        tag: "ERROR",
        message: String(err),
        prev: this.currentPhase,
      })
    }
  }

  public async removeEntry(id: string, tabId: number): Promise<void> {
    try {
      const resp = await sendMsg({
        type: "REMOVE_ENTRY",
        id,
      })
      if (!resp.ok)
        throw new Error("Failed to remove Entry", { cause: resp.error })

      void this.reloadToIdle(tabId)
    } catch (err) {
      this.transition({
        tag: "ERROR",
        message: String(err),
        prev: this.currentPhase,
      })
    }
  }

  /** Back to the list, re-reading state and the active tab (e.g. Cancel). */
  public backToIdle(tabId: number): Promise<void> {
    return this.reloadToIdle(tabId)
  }

  /** Mark or unmark the active tab's site as a streaming site. */
  public async setStreamSite(
    site: string,
    streaming: boolean,
    tabId: number
  ): Promise<void> {
    try {
      const resp = await sendMsg({ type: "SET_STREAM_SITE", site, streaming })
      if (!resp.ok)
        throw new Error("Failed to set streaming site", { cause: resp.error })

      void this.reloadToIdle(tabId)
    } catch (err) {
      this.transition({
        tag: "ERROR",
        message: String(err),
        prev: this.currentPhase,
      })
    }
  }

  private async reloadToIdle(tabId: number): Promise<void> {
    try {
      const resp = await sendMsg({
        type: "GET_STATE",
      })
      if (!resp.ok)
        throw new Error("Failed to reloadIdle", { cause: resp.error })

      const tabs = await browser.tabs.query({
        active: true,
        currentWindow: true,
      })
      this.transition(await idlePhase(resp.state, tabId, tabs[0]?.url ?? ""))
    } catch (err) {
      this.transition({
        tag: "ERROR",
        message: String(err),
        prev: this.currentPhase,
      })
    }
  }

  public async refreshEntry(
    entry: DramaEntry,
    tabId: number,
    state: WatchlistState
  ): Promise<void> {
    this.transition({ tag: "SCRAPING", state, tabId })
    try {
      const results = await browser.tabs.executeScript(tabId, {
        code: `(${scrapeActiveTabMedia.toString()})()`,
      })
      const data = results[0]

      // Only structural fields — opinionated ones intentionally omitted so the
      // UPSERT_ENTRY merge path leaves them untouched.
      const payload: Partial<DramaEntry> & { title: string } = {
        id: entry.id,
        title: data?.title || entry.title,
        episode: data?.episode || entry.episode,
        network: data?.network || entry.network,
        posterUrl: data?.posterUrl ?? entry.posterUrl,
        timestamp: data?.timestamp || entry.timestamp,
        progress: data?.progress ?? entry.progress,
        isPlaying: data?.isPlaying ?? entry.isPlaying,
        url: data?.url || entry.url,
      }

      await this.saveEntry(payload, state, tabId)
    } catch (err) {
      this.transition({
        tag: "ERROR",
        message: `Refresh failed: ${String(err)}`,
        prev: this.currentPhase,
      })
    }
  }
}

/**
 * The IDLE phase for the active tab: its site, whether that site is marked as
 * a streaming site, and how many <video> elements it has — counted on every
 * tab, since any tab may be the one about to be marked. Pages the extension
 * cannot script (about:, the add-ons store) count as 0.
 */
async function idlePhase(
  state: WatchlistState,
  tabId: number,
  tabUrl: string
): Promise<Extract<PopupPhase, { tag: "IDLE" }>> {
  const site = siteOf(tabUrl)
  let videoCount = 0
  if (site && tabId !== -1) {
    const diagnostic: Array<unknown> = await browser.tabs
      .executeScript(tabId, {
        code: `document.querySelectorAll('video').length`,
      })
      .catch(() => [0])
    const [count] = diagnostic
    videoCount = typeof count === "number" ? count : 0
  }
  return {
    tag: "IDLE",
    state,
    tabId,
    site,
    isStreamSite: isStreamSite(tabUrl, state.streamSites),
    videoCount,
  }
}
