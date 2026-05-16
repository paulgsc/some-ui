import { VIDEO_HOSTS } from "@drama/lib/popup/constants"
import { isVideoHost, sendMsg } from "@drama/lib/popup/messaging"
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
        sendMsg<{ ok: boolean; state: WatchlistState }>({ type: "GET_STATE" }),
        browser.tabs.query({ active: true, currentWindow: true }),
      ])

      const tab = tabs[0]
      const tabId = tab?.id ?? -1
      const tabUrl = tab?.url ?? ""
      const isVideoTab = isVideoHost(tabUrl, VIDEO_HOSTS)

      if (!stateResp.ok)
        throw new Error(
          "Failed to load backend state synchronization frameworks"
        )

      let videoCount = 0
      if (isVideoTab && tabId !== -1) {
        const diagnostic = await browser.tabs
          .executeScript(tabId, {
            code: `document.querySelectorAll('video').length`,
          })
          .catch(() => [0])
        videoCount = diagnostic[0] as number
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
      const resp = await sendMsg<{
        ok: boolean
        state: WatchlistState
        error?: string
      }>({
        type: "UPSERT_ENTRY",
        entry,
      })
      if (!resp.ok) throw new Error(resp.error ?? "Failed to save entry")

      this.reloadToIdle(tabId)
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
      const resp = await sendMsg<{ ok: boolean; state: WatchlistState }>({
        type: "SET_ACTIVE",
        id,
      })
      if (resp.ok) this.reloadToIdle(tabId)
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
      const resp = await sendMsg<{ ok: boolean; state: WatchlistState }>({
        type: "REMOVE_ENTRY",
        id,
      })
      if (resp.ok) this.reloadToIdle(tabId)
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
      const stateResp = await sendMsg<{ ok: boolean; state: WatchlistState }>({
        type: "GET_STATE",
      })
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
        videoCount = diagnostic[0] as number
      }

      this.transition({
        tag: "IDLE",
        state: stateResp.state,
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
}
