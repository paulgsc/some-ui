/**
 * BannerMarquee — sticky bottom-of-viewport intent banner
 *
 * Design:
 *   - Full width, 28px height at rest — minimal vertical footprint
 *   - z-index: 9000 — above page content, below dialogs / dropdowns / navbars
 *   - Hides on fullscreen video (same as HUD)
 *   - Toggled by KeyBinding (default Alt+B, passed in)
 *   - Text: fetched from Axum /banner on mount, manual override via hover form
 *   - Flicker/glow: occasional CSS animation that illuminates the text
 *     with an accent gradient — segment-aware accent color, falls back to white
 *   - Marquee: if text overflows, scrolls horizontally
 *   - Dark-mode-first design
 */

import type { KeyCombo } from "@tab/lib/content/key-binding"
import { KeyBinding } from "@tab/lib/content/key-binding"
import type { BannerState, OutboundMessage, Segment } from "@tab/types"
import { SEGMENT_DISPLAY } from "@tab/types"

const BANNER_ID = "__tl2_banner__"

export type BannerOptions = {
  toggleCombo?: KeyCombo
}

const DEFAULT_COMBO: KeyCombo = { key: "b", alt: true }

async function sendMessage(msg: object): Promise<OutboundMessage> {
  return browser.runtime.sendMessage(msg) as Promise<OutboundMessage>
}

export class BannerMarquee {
  private el: HTMLElement
  private textEl: HTMLElement
  private inputEl: HTMLInputElement
  private errorEl: HTMLElement
  private shimEl: HTMLElement

  private visible = true
  private isFullscreen = false
  private segment: Segment | null = null
  private keyBinding: KeyBinding
  private flickerInterval: ReturnType<typeof setInterval> | null = null

  constructor(options: BannerOptions = {}) {
    const combo = options.toggleCombo ?? DEFAULT_COMBO

    // ── Root ──────────────────────────────────────────────────────────────────
    this.el = document.createElement("div")
    this.el.id = BANNER_ID

    // ── Shim (the gradient glow overlay — animated) ───────────────────────────
    this.shimEl = document.createElement("div")
    this.shimEl.className = "__tl2_banner_shim"

    // ── Text track (marquee container) ────────────────────────────────────────
    const track = document.createElement("div")
    track.className = "__tl2_banner_track"

    this.textEl = document.createElement("span")
    this.textEl.className = "__tl2_banner_text"
    this.textEl.textContent = ""

    track.appendChild(this.textEl)

    // ── Inline edit input (shown on hover) ────────────────────────────────────
    const editWrap = document.createElement("div")
    editWrap.className = "__tl2_banner_edit"

    this.inputEl = document.createElement("input")
    this.inputEl.type = "text"
    this.inputEl.className = "__tl2_banner_input"
    this.inputEl.placeholder = "set intent…"
    this.inputEl.maxLength = 256
    this.inputEl.spellcheck = false
    this.inputEl.autocomplete = "off"

    this.inputEl.addEventListener("keydown", (e) => {
      e.stopPropagation() // prevent key-binding firing inside input
      if (e.key === "Enter") {
        void this.submitText(this.inputEl.value.trim())
        this.inputEl.blur()
      }
      if (e.key === "Escape") {
        this.inputEl.blur()
      }
    })

    editWrap.appendChild(this.inputEl)

    // ── Error label ───────────────────────────────────────────────────────────
    this.errorEl = document.createElement("div")
    this.errorEl.className = "__tl2_banner_error"
    this.errorEl.style.display = "none"

    // ── Compose ───────────────────────────────────────────────────────────────
    this.el.appendChild(this.shimEl)
    this.el.appendChild(track)
    this.el.appendChild(editWrap)
    this.el.appendChild(this.errorEl)

    // ── Key binding ───────────────────────────────────────────────────────────
    this.keyBinding = new KeyBinding(combo, () => this.toggle())
    this.keyBinding.mount()

    // ── Fullscreen detection ──────────────────────────────────────────────────
    const onFullscreen = (): void => {
      const fsEl =
        document.fullscreenElement ?? document.webkitFullscreenElement
      this.isFullscreen = !!fsEl
      this.applyVisibility()
    }
    document.addEventListener("fullscreenchange", onFullscreen)
    document.addEventListener("webkitfullscreenchange", onFullscreen)

    // ── Flicker loop ──────────────────────────────────────────────────────────
    this.startFlicker()
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  setSegment(segment: Segment | null): void {
    this.segment = segment
    this.el.dataset.segment = segment ?? ""
    this.updateShimColor()
  }

  async fetchAndUpdate(): Promise<void> {
    try {
      const resp = await sendMessage({ type: "GET_BANNER" })
      if (resp.type === "BANNER_STATE") {
        this.applyBannerState(resp.banner)
      }
    } catch {}
  }

  mount(container: HTMLElement): void {
    container.appendChild(this.el)
  }

  unmount(): void {
    this.keyBinding.dispose()
    if (this.flickerInterval) clearInterval(this.flickerInterval)
    this.el.remove()
  }

  getElement(): HTMLElement {
    return this.el
  }

  // ── Internal ─────────────────────────────────────────────────────────────────

  private toggle(): void {
    this.visible = !this.visible
    this.applyVisibility()
  }

  private applyVisibility(): void {
    const shouldShow = this.visible && !this.isFullscreen
    this.el.classList.toggle("__tl2_banner_hidden", !shouldShow)
  }

  private applyBannerState(state: BannerState): void {
    this.setText(state.text)
    if (state.lastFetchError) {
      this.showError(state.lastFetchError)
    } else {
      this.hideError()
    }
  }

  private setText(text: string): void {
    this.textEl.textContent = text
    this.inputEl.value = text

    // Trigger marquee only if text is long
    const isLong = text.length > 60
    this.textEl.classList.toggle("__tl2_marquee", isLong)
  }

  private showError(msg: string): void {
    this.errorEl.textContent = `⚠ ${msg}`
    this.errorEl.style.display = "block"
  }

  private hideError(): void {
    this.errorEl.style.display = "none"
  }

  private async submitText(text: string): Promise<void> {
    if (!text) return
    this.setText(text)
    try {
      const resp = await sendMessage({ type: "SET_BANNER_TEXT", text })
      if (resp.type === "ERR") {
        this.showError(resp.message)
      } else {
        this.hideError()
      }
    } catch (err) {
      this.showError(err instanceof Error ? err.message : "Unknown error")
    }
  }

  private updateShimColor(): void {
    if (this.segment) {
      const accent = SEGMENT_DISPLAY[this.segment].accent
      this.shimEl.style.setProperty("--tl-banner-accent", accent)
    } else {
      this.shimEl.style.removeProperty("--tl-banner-accent")
    }
  }

  private startFlicker(): void {
    // Random flicker: illuminate fully every 8–20 seconds for 600ms
    const scheduleNext = (): void => {
      const delay = 8000 + Math.random() * 12000
      this.flickerInterval = setTimeout(() => {
        this.el.classList.add("__tl2_banner_glow")
        setTimeout(() => {
          this.el.classList.remove("__tl2_banner_glow")
          scheduleNext()
        }, 700)
      }, delay) as unknown as ReturnType<typeof setInterval>
    }
    scheduleNext()
  }
}
