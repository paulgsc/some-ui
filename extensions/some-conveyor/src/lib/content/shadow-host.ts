import type { Disposable } from "@conveyor/types"

const SHADOW_HOST_ID = "some-conveyor-host"

// Must match the `--overlay-fade-duration` opacity transition in conveyor.css.
// The host is only detached from layout/paint (display:none) once the fade has
// played, so the value lives in both layers and is kept in sync by hand.
const OVERLAY_FADE_MS = 420

/**
 * ShadowHost
 *
 * Creates an isolated shadow DOM root attached to a host element appended to
 * document.body. All extension DOM lives inside this shadow root, which means:
 *
 *   - Vendor CSS cannot style our elements
 *   - Our CSS cannot style vendor elements
 *   - Our z-index stack is isolated from the page's z-index stack
 *
 * Z-index policy (page-level, on the host element itself):
 *   The host element sits at z-index 2147483640 — below browser chrome but
 *   reliably above page content including most modals and overlays.
 *   We yield to fullscreen elements via pointer-events:none when suspended.
 *
 * Note: we intentionally do NOT use z-index: 2147483647 (max). Reserving
 * headroom lets vendor emergency UI (payment dialogs, security warnings) still
 * render above us if they also use high z-index values.
 */
export class ShadowHost implements Disposable {
  private readonly hostEl: HTMLElement
  readonly shadowRoot: ShadowRoot

  // Pending display:none after a fade-out, so a quick re-activation can cancel
  // the tear-down and keep the overlay mounted.
  private hideTimer: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly styleUrl: string) {
    // Prevent duplicate injection on SPA navigations that don't unload.
    const existing = document.getElementById(SHADOW_HOST_ID)
    if (existing) existing.remove()

    this.hostEl = document.createElement("div")
    this.hostEl.id = SHADOW_HOST_ID
    this.hostEl.setAttribute("data-some-conveyor", "true")

    // Host element geometry + z-index policy.
    Object.assign(this.hostEl.style, {
      position: "fixed",
      bottom: "0",
      left: "0",
      width: "100vw",
      zIndex: "2147483640",
      pointerEvents: "none", // the shadow content sets pointer-events: auto
      contain: "layout style paint",
      overflow: "visible",
    })

    this.shadowRoot = this.hostEl.attachShadow({ mode: "closed" })
    this.injectStylesheet()

    document.body.appendChild(this.hostEl)
  }

  private injectStylesheet(): void {
    const link = document.createElement("link")
    link.rel = "stylesheet"
    link.href = this.styleUrl
    this.shadowRoot.appendChild(link)
  }

  /** The host element in the page's light DOM. */
  get hostElement(): HTMLElement {
    return this.hostEl
  }

  /**
   * The conveyor mount point inside the shadow root.
   * ConveyorEngine appends cube elements here.
   */
  get mountPoint(): ShadowRoot {
    return this.shadowRoot
  }

  /**
   * Drive the host's whole presentation lifecycle from a single live/yielded
   * bit. This is the DOM half of the cake layer — it never touches the opacity
   * animation itself (that is `--overlay-fade-duration` on `.sc-zone` in
   * conveyor.css); it only flips `data-overlay-dimmed` and detaches the host
   * from layout once the fade has played.
   *
   * The host itself stays `pointer-events: none` permanently (only the cubes
   * opt back in, via a class), so it never blocks clicks in the gaps. While
   * dimmed, CSS neutralises the cubes too — so the page is fully interactive the
   * instant we yield, even during the fade, well before display:none lands.
   *
   *   active   → reveal, then fade the overlay in.
   *   inactive → fade out, then display:none after the fade so we stop
   *              painting/animating and fully detach. The belt's rAF is
   *              suspended separately by the runtime; this is purely the
   *              visible surface.
   */
  setActive(active: boolean): void {
    if (this.hideTimer !== null) {
      clearTimeout(this.hideTimer)
      this.hideTimer = null
    }

    if (active) {
      this.hostEl.style.display = ""
      // Reflow so dropping the dimmed flag animates from the opacity-0 state
      // rather than snapping.
      void this.hostEl.offsetWidth
      this.hostEl.removeAttribute("data-overlay-dimmed")
      return
    }

    this.hostEl.setAttribute("data-overlay-dimmed", "")
    this.hideTimer = setTimeout(() => {
      this.hostEl.style.display = "none"
      this.hideTimer = null
    }, OVERLAY_FADE_MS)
  }

  dispose(): void {
    if (this.hideTimer !== null) {
      clearTimeout(this.hideTimer)
      this.hideTimer = null
    }
    this.hostEl.remove()
  }
}
