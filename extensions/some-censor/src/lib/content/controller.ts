/**
 * Controller — lifecycle shell.
 *
 * Invariants:
 *
 *   C1 — Runtime is idempotent.  _setupRuntime() is a no-op if already running.
 *        Guarded by _mgr's phase, not by a boolean flag, so the source of truth
 *        is the manager itself.
 *   C2 — Navigation causes full teardown + restart.  yt-navigate-finish (chip
 *        clicks, sidebar links, watch→home, back/forward) routes through
 *        _teardownRuntime() + _setupRuntime().  This is the ONLY correct
 *        response to YouTube SPA navigation, because chip/feed swaps REUSE
 *        renderer elements in place: the elements stay connected, so prune()
 *        cannot evict them and their stale VideoEntry view (title/revealed)
 *        would survive.  Teardown destroys every entry and startSession() mints
 *        a fresh session, forcing every card back to masked.  The observer is
 *        disconnected before reset() — no mutations can trigger upsert() during
 *        teardown — and re-created by the subsequent setup, so exactly one
 *        observer is ever live.
 *
 *   C3 — _setupRuntime() calls startSession() which throws if already running.
 *        This makes double-setup a deterministic, observable error rather than
 *        silent duplicate state.
 *
 *   C4 — Navigation is debounced.  YouTube can fire yt-navigate-finish more
 *        than once per logical navigation (and during rapid chip toggling).
 *        We coalesce bursts into a single teardown+restart on a microtask-ish
 *        delay so we don't thrash sessions.
 */

import { ext } from "@censor/platform/content"

import { attachEvents } from "./events"
import type { KeyBindingDispose } from "./key-binding"
import { attachKeyBindings } from "./key-binding"
import { SEL, startObserver } from "./observer"
import { VideoManager } from "./video-manager"

const NAV_DEBOUNCE_MS = 150

export class Controller {
  private readonly _mgr = new VideoManager()

  private _observer: MutationObserver | null = null
  private _appWaiter: MutationObserver | null = null
  private _disposeKeyBindings: KeyBindingDispose | null = null
  private _navListener: (() => void) | null = null
  private _navDebounce: ReturnType<typeof setTimeout> | null = null

  init(): void {
    this._listenBroadcasts()
    this._listenNavigation()
    this._bootstrap()
  }

  // ── Bootstrap ─────────────────────────────────────────────────────────────

  private _bootstrap(): void {
    ext.runtime
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
    this._disposeKeyBindings = attachKeyBindings(this._mgr)
    requestAnimationFrame(() => this._scan())
  }

  private _teardownRuntime(): void {
    // Disconnect observer FIRST — no mutations during teardown
    this._observer?.disconnect()
    this._observer = null
    this._disposeKeyBindings?.()
    this._disposeKeyBindings = null
    this._mgr.reset()
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  /**
   * Owns yt-navigate-finish for the lifetime of the content script (C2/C4).
   * Registered once in init() and never removed — it must survive individual
   * teardown/setup cycles, since each navigation triggers exactly one of them.
   */
  private _listenNavigation(): void {
    this._navListener = () => {
      if (this._navDebounce !== null) clearTimeout(this._navDebounce)
      this._navDebounce = setTimeout(() => {
        this._navDebounce = null
        // Only restart if we were actually running; if disabled, stay down.
        this._teardownRuntime()
        this._waitForApp()
      }, NAV_DEBOUNCE_MS)
    }
    window.addEventListener("yt-navigate-finish", this._navListener)
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

  // ── Background messages ───────────────────────────────────────────────────

  private _listenBroadcasts(): void {
    ext.runtime.onMessage.addListener((msg: any) => {
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
