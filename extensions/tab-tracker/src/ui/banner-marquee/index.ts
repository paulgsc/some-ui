/**
 * BannerMarquee — sticky bottom-of-viewport intent ribbon
 *
 * Encodes: Intent = T × Banner
 *   T      → segment anchor (left, always visible: glyph + abbr)
 *   Banner → structured content (action token + detail) + active-time clock
 *
 * Layout: [anchor] [content track] [clock] [edit zone]
 *
 * Changes from v1:
 *   - Height: 28px → 40px. Room for structured layout.
 *   - Left anchor: persistent segment identity block (glyph + abbr label).
 *     Always readable. Segment-colored. Zero ambiguity at a glance.
 *   - Content model: raw string → (action | detail) parsed by delimiter.
 *     Convention: "action  —  detail" or "action  |  detail".
 *     Action renders at high contrast; detail at low. Flat strings render
 *     as detail-only at mid contrast.
 *   - Clock: live active-time display (mm:ss / h mm). Temporal grounding.
 *     Updated via setNode(). Dot pulses when segment is set.
 *   - Motion: event-driven only. Glow fires on setText() and setSegment()
 *     transitions — not on a random timer. Flicker = "something changed."
 *   - Marquee: slow drift (40s), only on overflow, idle = static.
 *   - Edit zone: always structurally present; input expands on hover via CSS.
 *     No separate opacity toggle needed in JS.
 *   - Error: positioned above the ribbon (tooltip-style), not inline.
 *   - Public API additions:
 *       setNode(node, activeMs) — drives the clock and segment state
 *       setText(text)          — now public; triggers glow
 */

import type { KeyCombo } from "@tab/lib/content/key-binding"
import { KeyBinding } from "@tab/lib/content/key-binding"
import type {
  BannerState,
  NodeState,
  OutboundMessage,
  Segment,
} from "@tab/types"
import { formatMs, SEGMENT_DISPLAY } from "@tab/types"

// ─── Segment glyphs ───────────────────────────────────────────────────────────
// One character per segment — recognisable at 12px without reading the label.

const SEGMENT_GLYPH: Record<Segment, string> = {
  math: "∑",
  dsa: "◆",
  systems: "⬡",
  infra: "⬢",
  language: "α",
  career: "↗",
  leisure: "○",
}

// ─── Delimiter tokens for structured content parsing ──────────────────────────

const DELIMITERS = ["  —  ", "  |  ", " — ", " | "]

function parseContent(text: string): { action: string | null; detail: string } {
  for (const delim of DELIMITERS) {
    const idx = text.indexOf(delim)
    if (idx !== -1) {
      return {
        action: text.slice(0, idx).trim(),
        detail: text.slice(idx + delim.length).trim(),
      }
    }
  }
  return { action: null, detail: text }
}

// ─── Types ────────────────────────────────────────────────────────────────────

const BANNER_ID = "__tl2_banner__"

export type BannerOptions = {
  toggleCombo?: KeyCombo
}

const DEFAULT_COMBO: KeyCombo = { key: "b", alt: true }

async function sendMessage(msg: object): Promise<OutboundMessage> {
  return browser.runtime.sendMessage(msg) as Promise<OutboundMessage>
}

// ─── BannerMarquee ────────────────────────────────────────────────────────────

export class BannerMarquee {
  // DOM refs
  private el: HTMLElement
  private shimEl: HTMLElement
  private anchorEl: HTMLElement
  private anchorGlyph: HTMLElement
  private anchorLabel: HTMLElement
  private contentEl: HTMLElement
  private actionEl: HTMLElement
  private sepEl: HTMLElement
  private detailEl: HTMLElement
  private clockDot: HTMLElement
  private clockTime: HTMLElement
  private inputEl: HTMLInputElement
  private errorEl: HTMLElement

  // State
  private visible = true
  private isFullscreen = false
  private segment: Segment | null = null
  private rawText = ""
  private clockInterval: ReturnType<typeof setInterval> | null = null
  private activeMs = 0
  private activeStart: number | null = null
  private glowTimeout: ReturnType<typeof setTimeout> | null = null

  private keyBinding: KeyBinding

  constructor(options: BannerOptions = {}) {
    const combo = options.toggleCombo ?? DEFAULT_COMBO

    // ── Root ──────────────────────────────────────────────────────────────────
    this.el = document.createElement("div")
    this.el.id = BANNER_ID

    // ── Glow shim ─────────────────────────────────────────────────────────────
    this.shimEl = document.createElement("div")
    this.shimEl.className = "__tl2_banner_shim"

    // ── Segment anchor ────────────────────────────────────────────────────────
    this.anchorEl = document.createElement("div")
    this.anchorEl.className = "__tl2_ribbon_anchor __tl2_anchor_unset"

    this.anchorGlyph = document.createElement("div")
    this.anchorGlyph.className = "__tl2_ribbon_anchor_glyph"
    this.anchorGlyph.textContent = "·"

    this.anchorLabel = document.createElement("div")
    this.anchorLabel.className = "__tl2_ribbon_anchor_label"
    this.anchorLabel.textContent = "—"

    this.anchorEl.appendChild(this.anchorGlyph)
    this.anchorEl.appendChild(this.anchorLabel)

    // ── Content track ─────────────────────────────────────────────────────────
    const track = document.createElement("div")
    track.className = "__tl2_banner_track"

    this.contentEl = document.createElement("div")
    this.contentEl.className = "__tl2_ribbon_content __tl2_flat"

    this.actionEl = document.createElement("span")
    this.actionEl.className = "__tl2_ribbon_action"
    this.actionEl.style.display = "none"

    this.sepEl = document.createElement("span")
    this.sepEl.className = "__tl2_ribbon_sep"
    this.sepEl.textContent = "—"
    this.sepEl.style.display = "none"

    this.detailEl = document.createElement("span")
    this.detailEl.className = "__tl2_ribbon_detail"

    this.contentEl.appendChild(this.actionEl)
    this.contentEl.appendChild(this.sepEl)
    this.contentEl.appendChild(this.detailEl)
    track.appendChild(this.contentEl)

    // ── Clock ─────────────────────────────────────────────────────────────────
    const clockEl = document.createElement("div")
    clockEl.className = "__tl2_ribbon_clock"

    this.clockDot = document.createElement("div")
    this.clockDot.className = "__tl2_ribbon_clock_dot"

    this.clockTime = document.createElement("div")
    this.clockTime.className = "__tl2_ribbon_clock_time"
    this.clockTime.textContent = "00:00"

    clockEl.appendChild(this.clockDot)
    clockEl.appendChild(this.clockTime)

    // ── Edit zone ─────────────────────────────────────────────────────────────
    const editEl = document.createElement("div")
    editEl.className = "__tl2_banner_edit"

    const hintEl = document.createElement("span")
    hintEl.className = "__tl2_banner_edit_hint"
    hintEl.textContent = "intent"

    this.inputEl = document.createElement("input")
    this.inputEl.type = "text"
    this.inputEl.className = "__tl2_banner_input"
    this.inputEl.placeholder = "set intent…"
    this.inputEl.maxLength = 256
    this.inputEl.spellcheck = false
    this.inputEl.autocomplete = "off"

    this.inputEl.addEventListener("keydown", (e) => {
      e.stopPropagation()
      if (e.key === "Enter") {
        void this.submitText(this.inputEl.value.trim())
        this.inputEl.blur()
      }
      if (e.key === "Escape") {
        this.inputEl.blur()
      }
    })

    editEl.appendChild(hintEl)
    editEl.appendChild(this.inputEl)

    // ── Error (tooltip above ribbon) ──────────────────────────────────────────
    this.errorEl = document.createElement("div")
    this.errorEl.className = "__tl2_banner_error"

    // ── Compose ───────────────────────────────────────────────────────────────
    this.el.appendChild(this.shimEl)
    this.el.appendChild(this.anchorEl)
    this.el.appendChild(track)
    this.el.appendChild(clockEl)
    this.el.appendChild(editEl)
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

    // ── Clock tick ────────────────────────────────────────────────────────────
    this.clockInterval = setInterval(() => this.tickClock(), 1000)
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  /**
   * Update segment display (anchor glyph, label, accent).
   * Triggers glow on transition.
   */
  setSegment(segment: Segment | null): void {
    const changed = segment !== this.segment
    this.segment = segment
    this.el.dataset.segment = segment ?? ""

    if (segment) {
      const cfg = SEGMENT_DISPLAY[segment]
      this.anchorGlyph.textContent = SEGMENT_GLYPH[segment]
      this.anchorLabel.textContent = cfg.abbr
      this.anchorEl.classList.remove("__tl2_anchor_unset")
    } else {
      this.anchorGlyph.textContent = "·"
      this.anchorLabel.textContent = "—"
      this.anchorEl.classList.add("__tl2_anchor_unset")
    }

    if (changed) this.triggerGlow()
  }

  /**
   * Update from node state — drives the clock.
   * Called by content.ts on each poll tick.
   */
  setNode(node: NodeState): void {
    this.activeMs = node.lastActiveMs
    this.activeStart = node.activeStart
    // Sync segment if not already set
    if (node.segment && node.segment !== this.segment) {
      this.setSegment(node.segment)
    }
    // Immediate tick
    this.tickClock()
  }

  /**
   * Set the intent text. Parses (action | detail) structure.
   * Triggers glow on content change.
   */
  setText(text: string): void {
    const changed = text !== this.rawText
    this.rawText = text
    this.inputEl.value = text

    const { action, detail } = parseContent(text)

    if (action) {
      this.actionEl.textContent = action
      this.actionEl.style.display = ""
      this.sepEl.style.display = ""
      this.detailEl.textContent = detail
      this.contentEl.classList.remove("__tl2_flat")
    } else {
      this.actionEl.style.display = "none"
      this.sepEl.style.display = "none"
      this.detailEl.textContent = detail
      this.contentEl.classList.add("__tl2_flat")
    }

    // Marquee: only activate on content overflow
    // We measure after a microtask to let the DOM settle
    void Promise.resolve().then(() => this.updateMarquee())

    if (changed && text.length > 0) this.triggerGlow()
  }

  async fetchAndUpdate(): Promise<void> {
    try {
      const resp = await sendMessage({ type: "GET_BANNER" })
      if (resp.type === "BANNER_STATE") {
        this.applyBannerState(resp.banner)
      }
    } catch {
      // Background may not be ready; the banner keeps its current state.
    }
  }

  mount(container: HTMLElement): void {
    container.appendChild(this.el)
  }

  unmount(): void {
    this.keyBinding.dispose()
    if (this.clockInterval) clearInterval(this.clockInterval)
    if (this.glowTimeout) clearTimeout(this.glowTimeout)
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

  private showError(msg: string): void {
    this.errorEl.textContent = `⚠ ${msg}`
    this.errorEl.classList.add("__tl2_error_visible")
  }

  private hideError(): void {
    this.errorEl.classList.remove("__tl2_error_visible")
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

  // ── Glow — event-driven only ──────────────────────────────────────────────

  private triggerGlow(): void {
    if (this.glowTimeout) clearTimeout(this.glowTimeout)
    this.el.classList.remove("__tl2_banner_glow")
    // Force reflow so animation restarts if already active
    void this.el.offsetWidth
    this.el.classList.add("__tl2_banner_glow")
    this.glowTimeout = setTimeout(() => {
      this.el.classList.remove("__tl2_banner_glow")
    }, 600)
  }

  // ── Marquee — overflow-driven ─────────────────────────────────────────────

  private updateMarquee(): void {
    const track = this.contentEl.parentElement
    if (!track) return

    const trackWidth = track.clientWidth
    const contentWidth = this.contentEl.scrollWidth

    const overflows = contentWidth > trackWidth - 48 // 48 = fade mask clearance

    if (overflows) {
      // Double content for seamless loop if not already doubled
      if (!this.contentEl.dataset.doubled) {
        // Clone the inner HTML to double it for the marquee loop
        const originalHTML = this.contentEl.innerHTML
        this.contentEl.innerHTML = originalHTML + originalHTML
        this.contentEl.dataset.doubled = "1"
      }
      this.contentEl.classList.add("__tl2_marquee")
    } else {
      if (this.contentEl.dataset.doubled) {
        // Restore single copy
        const children = Array.from(this.contentEl.children)
        const half = children.length / 2
        for (let i = children.length - 1; i >= half; i--) {
          children[i]?.remove()
        }
        delete this.contentEl.dataset.doubled
        // Re-wire refs after DOM manipulation
        this.rewireContentRefs()
      }
      this.contentEl.classList.remove("__tl2_marquee")
    }
  }

  /**
   * After the DOM is manipulated for marquee doubling/undoubling,
   * re-wire the span refs so subsequent setText calls update the right elements.
   */
  private rewireContentRefs(): void {
    const spans = this.contentEl.querySelectorAll("span")
    // Structure: [action, sep, detail] (action/sep may be hidden)
    if (spans.length >= 3) {
      // Refs are already live DOM nodes — just update display text again
      this.actionEl.textContent = this.actionEl.textContent ?? ""
      this.detailEl.textContent = this.detailEl.textContent ?? ""
    }
  }

  // ── Clock ─────────────────────────────────────────────────────────────────

  private tickClock(): void {
    let liveMs = this.activeMs
    if (this.activeStart !== null) {
      liveMs += Date.now() - this.activeStart
    }
    this.clockTime.textContent = formatMs(liveMs)
  }
}
