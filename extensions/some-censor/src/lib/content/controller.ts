/**
 * Controller — lifecycle shell.
 *
 * Invariants:
 *
 *   C1 — Runtime is idempotent.  _setupRuntime() is a no-op if already running.
 *        Guarded by _mgr's phase, not by a boolean flag, so the source of truth
 *        is the manager itself.
 *
 *   C2 — Navigation causes full teardown + restart.  _teardownRuntime() +
 *        _setupRuntime() rather than reset-inside-running-system.
 *        The observer is disconnected before reset() — no mutations can trigger
 *        upsert() during teardown.
 *
 *   C3 — _setupRuntime() calls startSession() which throws if already running.
 *        This makes double-setup a deterministic, observable error rather than
 *        silent duplicate state.
 */

import { attachEvents } from "./events"
import { SEL, startObserver } from "./observer"
import { VideoManager } from "./video-manager"

export class Controller {
  private readonly _mgr = new VideoManager()

  private _observer: MutationObserver | null = null
  private _appWaiter: MutationObserver | null = null
  private _lastUrl = location.href

  init(): void {
    this._listenBroadcasts()
    this._bootstrap()
  }

  // ── Bootstrap ─────────────────────────────────────────────────────────────

  private _bootstrap(): void {
    browser.runtime
      .sendMessage({ type: "GET_ENABLED" })
      .then((r: any) => {
        const enabled =
          r?.ok && typeof r.enabled === "boolean" ? r.enabled : true
        if (enabled) this._waitForApp()
        // If disabled, do nothing — _waitForApp never called, runtime never starts
      })
      .catch(() => {
        // Degraded: proceed as enabled (safe default)
        this._waitForApp()
      })
  }

  // ── Runtime setup/teardown ────────────────────────────────────────────────

  private _setupRuntime(): void {
    try {
      this._mgr.startSession() // throws if already running — C3
    } catch {
      return // already running, no-op — C1
    }

    attachEvents(this._mgr)
    this._observer = startObserver(this._mgr)
    this._listenNavigation()
    requestAnimationFrame(() => this._scan())
  }

  private _teardownRuntime(): void {
    // Disconnect observer FIRST — no mutations during teardown
    this._observer?.disconnect()
    this._observer = null
    this._mgr.reset()
  }

  // ── DOM bootstrap ─────────────────────────────────────────────────────────

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
    document
      .querySelectorAll<HTMLElement>(SEL)
      .forEach((el) => this._mgr.upsert(el))
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  private _listenNavigation(): void {
    window.addEventListener("yt-navigate-finish", () => {
      this._teardownRuntime()
      setTimeout(() => this._setupRuntime(), 200)
    })

    setInterval(() => {
      if (location.href !== this._lastUrl) {
        this._lastUrl = location.href
        this._teardownRuntime()
        setTimeout(() => this._setupRuntime(), 200)
      }
    }, 1000)
  }

  // ── Background messages ───────────────────────────────────────────────────

  private _listenBroadcasts(): void {
    browser.runtime.onMessage.addListener((msg: any) => {
      switch (msg.type) {
        case "ENABLED_CHANGED":
          if (msg.enabled) {
            this._setupRuntime()
          } else {
            this._teardownRuntime()
          }
          break

        case "CHANNEL_WHITELISTED":
          this._mgr.applyWhitelistBroadcast(msg.channelId)
          break
      }
    })
  }
}
