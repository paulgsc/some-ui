import type { AttentionMode, Disposable } from "@conveyor/types"

type AttentionListener = (mode: AttentionMode) => void

/**
 * PageMonitor
 *
 * Single source of truth for page attention state. Watches:
 *
 *   Fullscreen     → Suspended  (hard suspend — cancel rAF, hide DOM)
 *   Tab hidden     → Suspended
 *   Video playing  → Reduced    (user is consuming, not idle)
 *   User typing    → Reduced
 *   Scroll active  → Reduced    (brief window)
 *   Otherwise      → Active
 *
 * Emits AttentionMode changes to registered listeners.
 * Does NOT know about ConveyorEngine or the DOM tree — it only observes.
 *
 * Extension-specific concerns:
 *   - We must not compete with YouTube, Netflix, or any media site.
 *   - We detect video play state by querying document.querySelector("video"),
 *     not by inspecting extension state.
 *   - All listeners are passive to never block the vendor page's event loop.
 */
export class PageMonitor implements Disposable {
  private mode: AttentionMode = "Active"
  private readonly listeners = new Set<AttentionListener>()

  // Flags driving the mode computation.
  private isFullscreen = false
  private isHidden = false
  private isVideoPlaying = false
  private isTyping = false
  private isScrolling = false

  // Scroll debounce timer.
  private scrollTimer: ReturnType<typeof setTimeout> | null = null

  // Video poll interval (videos don't emit reliable events in content scripts).
  private videoPollInterval: ReturnType<typeof setInterval> | null = null

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
    this.addListener(document, "keydown", this.onKeydown, { passive: true })
    this.addListener(document, "keyup", this.onKeyup, { passive: true })
    this.addListener(document, "scroll", this.onScroll, { passive: true })

    // Poll for video state every 2s — content scripts don't reliably receive
    // play/pause events from vendor video elements.
    this.videoPollInterval = setInterval(() => this.pollVideoState(), 2_000)

    // Snap initial state.
    this.isHidden = document.hidden
    this.isFullscreen = this.detectFullscreen()
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
    this.recompute()
  }

  private onVisibilityChange(): void {
    this.isHidden = document.hidden
    this.recompute()
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

  // ── Mode computation ───────────────────────────────────────────────────────

  private detectFullscreen(): boolean {
    return !!(
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement ||
      (document as any).mozFullScreenElement
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
          console.error("[PageMonitor]", e)
        }
      }
    }
  }

  private computeMode(): AttentionMode {
    if (this.isFullscreen || this.isHidden) return "Suspended"
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

    this.listeners.clear()
  }
}
