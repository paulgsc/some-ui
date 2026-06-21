import type { Disposable } from "@conveyor/types"

const SHADOW_HOST_ID = "some-conveyor-host"

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

  /**
   * The conveyor mount point inside the shadow root.
   * ConveyorEngine appends cube elements here.
   */
  get mountPoint(): ShadowRoot {
    return this.shadowRoot
  }

  setPointerEvents(enabled: boolean): void {
    this.hostEl.style.pointerEvents = enabled ? "auto" : "none"
  }

  setVisibility(visible: boolean): void {
    this.hostEl.style.display = visible ? "" : "none"
  }

  dispose(): void {
    this.hostEl.remove()
  }
}
