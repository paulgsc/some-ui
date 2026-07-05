import { VIDEO_HOSTS } from "@drama/logic/popup/constants"
import type { DramaEntry, PopupPhase, WatchlistState } from "@drama/types"

// Statically import the scraper function using modern ES module syntax
import { scrapeActiveTabMedia } from "./content-scraper"
import { isVideoHost, sendMsg } from "./messaging"

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
      const isVideoTab = isVideoHost(tabUrl, VIDEO_HOSTS)

      let videoCount = 0
      if (isVideoTab && tabId !== -1) {
        const diagnostic = await browser.tabs
          .executeScript(tabId, {
            code: `document.querySelectorAll('video').length`,
          })
          .catch(() => [0])
        videoCount = diagnostic[0] ?? 0
      }

      this.transition({
        tag: "IDLE",
        state: stateResp.state,
        tabId,
        isVideoTab,
        videoCount,
      })
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
      const url = tabs[0]?.url ?? ""

      let videoCount = 0
      if (tabId !== -1) {
        const diagnostic = await browser.tabs
          .executeScript(tabId, {
            code: `document.querySelectorAll('video').length`,
          })
          .catch(() => [0])
        videoCount = diagnostic[0] ?? 0
      }

      this.transition({
        tag: "IDLE",
        state: resp.state,
        tabId,
        isVideoTab: isVideoHost(url, VIDEO_HOSTS),
        videoCount,
      })
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
