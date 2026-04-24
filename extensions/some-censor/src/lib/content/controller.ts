import type { ControllerState } from "@censor/types/states"

import { attachEvents } from "./events"
import { SEL, startObserver } from "./observer"
import { VideoManager } from "./video-manager"

export class Controller {
  private readonly _mgr = new VideoManager()

  private _state: ControllerState = { kind: "booting" }

  private _lastUrl = location.href
  private _observer: MutationObserver | null = null
  private _appWaiter: MutationObserver | null = null

  init(): void {
    this._listenBroadcasts()
    this._bootstrap()
  }

  // ─────────────────────────────────────────────
  // Bootstrap
  // ─────────────────────────────────────────────

  private _bootstrap(): void {
    browser.runtime
      .sendMessage({ type: "GET_ENABLED" })
      .then((r: any) => {
        if (!r?.ok || typeof r.enabled !== "boolean") {
          this._enterDegraded("invalid GET_ENABLED response")
          return
        }

        this._enterActive(r.enabled)
      })
      .catch((err) => {
        this._enterDegraded(`GET_ENABLED failed: ${String(err)}`)
      })

    this._waitForApp()
  }

  // ─────────────────────────────────────────────
  // State transitions
  // ─────────────────────────────────────────────

  private _enterActive(enabled: boolean): void {
    this._state = { kind: "active", enabled }

    if (!enabled) {
      this._disableRuntime()
      return
    }

    this._setupRuntime()
  }

  private _enterDegraded(reason: string): void {
    console.warn("[BOYO][Controller] → DEGRADED", reason)

    this._state = {
      kind: "degraded",
      reason,
      enabled: true, // safe default: keep UX alive
    }

    this._setupRuntime()
  }

  // ─────────────────────────────────────────────
  // Runtime setup
  // ─────────────────────────────────────────────

  private _isEnabled(): boolean {
    switch (this._state.kind) {
      case "active":
        return this._state.enabled

      case "degraded":
        return this._state.enabled

      case "booting":
        return true
    }
  }

  private _setupRuntime(): void {
    const enabled = this._isEnabled()

    if (!enabled) {
      this._disableRuntime()
      return
    }

    attachEvents(this._mgr)

    this._observer = startObserver(this._mgr)

    this._listenNavigation()

    requestAnimationFrame(() => this._scan())
  }

  private _disableRuntime(): void {
    console.warn("[BOYO][Controller] runtime disabled")

    this._observer?.disconnect()
    this._observer = null

    this._mgr.reset()
  }

  // ─────────────────────────────────────────────
  // DOM bootstrap
  // ─────────────────────────────────────────────

  private _waitForApp(): void {
    if (document.querySelector("ytd-app")) {
      this._setupRuntime()
      return
    }

    this._appWaiter = new MutationObserver(() => {
      if (document.querySelector("ytd-app")) {
        this._appWaiter?.disconnect()
        this._appWaiter = null

        this._setupRuntime()
      }
    })

    this._appWaiter.observe(document.documentElement, {
      childList: true,
      subtree: true,
    })
  }

  private _scan(): void {
    const nodes = document.querySelectorAll<HTMLElement>(SEL)

    nodes.forEach((el) => this._mgr.upsert(el))
  }

  // ─────────────────────────────────────────────
  // Navigation
  // ─────────────────────────────────────────────

  private _listenNavigation(): void {
    window.addEventListener("yt-navigate-finish", () => {
      this._mgr.reset()

      setTimeout(() => this._scan(), 600)
    })

    setInterval(() => {
      if (location.href !== this._lastUrl) {
        this._lastUrl = location.href

        this._mgr.reset()

        setTimeout(() => this._scan(), 600)
      }
    }, 1000)
  }

  // ─────────────────────────────────────────────
  // Background messages
  // ─────────────────────────────────────────────

  private _listenBroadcasts(): void {
    browser.runtime.onMessage.addListener((msg: any) => {
      switch (msg.type) {
        case "ENABLED_CHANGED":
          this._enterActive(msg.enabled)
          break

        case "CHANNEL_WHITELISTED":
          this._mgr.applyWhitelistBroadcast(msg.channelId)
          break
      }
    })
  }
}
