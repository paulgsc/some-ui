import type { AttentionMode, Disposable } from "@conveyor/types"

type AttentionListener = (mode: AttentionMode) => void

/**
 * PageMonitor
 *
 * Single source of truth for page attention state. Watches:
 *
 *   Fullscreen      → Suspended  (hard suspend — cancel rAF, tear down DOM)
 *   Tab hidden      → Suspended
 *   Window focused  → Suspended
 *   Video playing   → Reduced    (user is consuming, not idle)
 *   User typing     → Reduced
 *   Scroll active   → Reduced    (brief window)
 *   Otherwise       → Active
 *
 * Emits AttentionMode changes to registered listeners.
 * Does NOT know about ConveyorEngine or the DOM tree — it only observes.
 *
 * Extension-specific concerns:
 *   - We must not compete with YouTube, Netflix, or any media site.
 *   - We detect video play state by querying document.querySelector("video"),
 *     not by inspecting extension state.
 *   - All listeners are passive to never block the vendor page's event loop.
 *
 * Window focus is a first-class suspend input, not a cosmetic overlay. The
 * overlay is meant for a captured-but-unfocused tab — e.g. the tab is pulled
 * into an OBS scene (visible, document.hidden === false) while the user's OS
 * focus sits on another app (window blurred). That is the *only* state in which
 * the conveyor should run; the moment the window regains focus (the user is
 * actually looking at the page) it must yield like any other suspend, so it
 * never burns CPU or intercepts clicks behind a page the user is reading.
 * Tab visibility and window focus are distinct (a foreground tab in a blurred
 * window is visible-but-unfocused), so both are tracked and both gate the mode.
 */
export class PageMonitor implements Disposable {
  private mode: AttentionMode = "Active"
  private readonly listeners = new Set<AttentionListener>()

  // Flags driving the mode computation.
  private isFullscreen = false
  private isHidden = false
  private isWindowFocused = true
  private isVideoPlaying = false
  private isTyping = false
  private isScrolling = false

  // Scroll debounce timer.
  private scrollTimer: ReturnType<typeof setTimeout> | null = null

  // Video poll interval (videos don't emit reliable events in content scripts).
  private videoPollInterval: ReturnType<typeof setInterval> | null = null

  // Deferred recompute guard for potential-activate transitions (blur, tab
  // becoming visible, fullscreen exit). Definite-suspend events cancel this
  // and recompute immediately, so a suspend signal always wins over an
  // in-flight activation without needing any debounce duration.
  private activationTimer: ReturnType<typeof setTimeout> | null = null

  private readonly boundHandlers: Array<[EventTarget, string, EventListener]> =
    []

  constructor() {
    this.setup()
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  get currentMode(): AttentionMode {
    return this.mode
  }

  onModeChange(listener: AttentionListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  // ── Setup ──────────────────────────────────────────────────────────────────

  private setup(): void {
    this.addListener(document, "fullscreenchange", this.onFullscreenChange)
    this.addListener(
      document,
      "webkitfullscreenchange",
      this.onFullscreenChange
    )
    this.addListener(document, "mozfullscreenchange", this.onFullscreenChange)
    this.addListener(document, "visibilitychange", this.onVisibilityChange)
    this.addListener(window, "focus", this.onWindowFocus)
    this.addListener(window, "blur", this.onWindowBlur)
    this.addListener(document, "keydown", this.onKeydown, { passive: true })
    this.addListener(document, "keyup", this.onKeyup, { passive: true })
    this.addListener(document, "scroll", this.onScroll, { passive: true })

    // Poll for video state every 2s — content scripts don't reliably receive
    // play/pause events from vendor video elements.
    this.videoPollInterval = setInterval(() => this.pollVideoState(), 2_000)

    // Snap initial state.
    this.isHidden = document.hidden
    this.isFullscreen = this.detectFullscreen()
    this.isWindowFocused = document.hasFocus()
    this.pollVideoState()
    this.recompute()
  }

  private addListener(
    target: EventTarget,
    event: string,
    handler: EventListener,
    options?: AddEventListenerOptions
  ): void {
    const bound = handler.bind(this)
    target.addEventListener(event, bound, options ?? false)
    this.boundHandlers.push([target, event, bound])
  }

  // ── Event handlers ─────────────────────────────────────────────────────────

  private onFullscreenChange(): void {
    this.isFullscreen = this.detectFullscreen()
    // Entering fullscreen is a definite suspend; exiting is a potential
    // activate — defer to let concurrent focus/hide events settle first.
    if (this.isFullscreen) {
      this.applySuspend()
    } else {
      this.scheduleActivationCheck()
    }
  }

  private onVisibilityChange(): void {
    this.isHidden = document.hidden
    // Becoming hidden is a definite suspend; becoming visible could be an
    // activate, but a focus event may follow in the next task (tab switch).
    // Defer so the focus event can cancel the activation before it fires.
    if (this.isHidden) {
      this.applySuspend()
    } else {
      this.scheduleActivationCheck()
    }
  }

  private onWindowFocus(): void {
    this.isWindowFocused = true
    this.applySuspend()
  }

  private onWindowBlur(): void {
    this.isWindowFocused = false
    // Do not recompute immediately — if this blur accompanies a tab switch
    // away, a visibilitychange(hidden) is about to fire on this tab and will
    // keep the mode Suspended. Deferring ensures a lone blur (window losing
    // focus while the tab stays visible) still activates, but a tab switch
    // collapses to a no-op because the hide lands before the timer fires.
    this.scheduleActivationCheck()
  }

  private onKeydown(): void {
    this.isTyping = true
    this.recompute()
  }

  private onKeyup(): void {
    this.isTyping = false
    this.recompute()
  }

  private onScroll(): void {
    this.isScrolling = true
    this.recompute()

    if (this.scrollTimer !== null) clearTimeout(this.scrollTimer)
    this.scrollTimer = setTimeout(() => {
      this.isScrolling = false
      this.recompute()
    }, 500)
  }

  // ── Video detection ────────────────────────────────────────────────────────

  private pollVideoState(): void {
    const videos = document.querySelectorAll<HTMLVideoElement>("video")
    this.isVideoPlaying = Array.from(videos).some(
      (v) => !v.paused && !v.ended && v.readyState > 2
    )
    this.recompute()
  }

  // ── Activation guard ───────────────────────────────────────────────────────

  /**
   * For potential-activate events: defer recompute by one task tick.
   *
   * Idempotent — a second call while the timer is pending is a no-op. Any
   * number of concurrent blur/visible/fullscreen-exit events collapse into a
   * single evaluation that reads the final settled flag values. By then,
   * any concurrent suspend signal (focus, hide) will have already landed via
   * applySuspend() and cancelled this timer, so no false-positive Active
   * frame can escape.
   */
  private scheduleActivationCheck(): void {
    if (this.activationTimer !== null) return
    this.activationTimer = setTimeout(() => {
      this.activationTimer = null
      this.recompute()
    }, 0)
  }

  /**
   * For definite-suspend events: cancel any pending activation and recompute
   * immediately. A suspend signal must always win over an in-flight
   * activation regardless of event ordering.
   */
  private applySuspend(): void {
    if (this.activationTimer !== null) {
      clearTimeout(this.activationTimer)
      this.activationTimer = null
    }
    this.recompute()
  }

  // ── Mode computation ───────────────────────────────────────────────────────

  private detectFullscreen(): boolean {
    type VendorDoc = {
      webkitFullscreenElement?: Element | null
      mozFullScreenElement?: Element | null
    }
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const doc = document as unknown as VendorDoc
    return !!(
      document.fullscreenElement ??
      doc.webkitFullscreenElement ??
      doc.mozFullScreenElement
    )
  }

  private recompute(): void {
    const next = this.computeMode()
    if (next !== this.mode) {
      this.mode = next
      for (const listener of this.listeners) {
        try {
          listener(next)
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error("[PageMonitor]", e)
        }
      }
    }
  }

  private computeMode(): AttentionMode {
    // The conveyor only runs for a foreground tab in an unfocused window. A
    // hidden tab, a focused window, or fullscreen are all hard suspends.
    if (this.isFullscreen || this.isHidden || this.isWindowFocused) {
      return "Suspended"
    }
    if (this.isVideoPlaying || this.isTyping || this.isScrolling)
      return "Reduced"
    return "Active"
  }

  // ── Disposable ─────────────────────────────────────────────────────────────

  dispose(): void {
    for (const [target, event, handler] of this.boundHandlers) {
      target.removeEventListener(event, handler)
    }
    this.boundHandlers.length = 0

    if (this.scrollTimer !== null) clearTimeout(this.scrollTimer)
    if (this.videoPollInterval !== null) clearInterval(this.videoPollInterval)
    if (this.activationTimer !== null) clearTimeout(this.activationTimer)

    this.listeners.clear()
  }
}
