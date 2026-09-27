// ── Spotlight ─────────────────────────────────────────────────────────────────
// Owns: the layer that takes over the card's face while a change is fresh.
// Does NOT decide when — DramaCard shows and clears it; the words come from
// logic/content/spotlight.ts. The effect is CSS, keyed by `data-tone`.

import { el } from "@drama/effects/content/dom"
import type { SpotlightView } from "@drama/logic/content/spotlight"

export class Spotlight {
  /** Root element — append to .dc-card */
  readonly root: HTMLDivElement

  private glyph: HTMLSpanElement
  private headline: HTMLSpanElement
  private detail: HTMLSpanElement

  constructor() {
    this.root = el("div", "dc-spotlight flex items-center")
    this.root.setAttribute("aria-live", "polite")
    this.glyph = el("span", "dc-spot-glyph")
    const words = el("div", "dc-spot-words flex flex-col")
    this.headline = el("span", "dc-spot-headline")
    this.detail = el("span", "dc-spot-detail")
    words.append(this.headline, this.detail)
    this.root.append(this.glyph, words)
  }

  /**
   * Show `view`, restarting its entrance and effect even when the same tone
   * is already showing (an escalated beat plays again, harder).
   */
  show(view: SpotlightView, strength: 1 | 2 | 3): void {
    this.glyph.textContent = view.glyph
    this.headline.textContent = view.headline
    this.detail.textContent = view.detail
    this.root.dataset.tone = view.tone
    this.root.style.setProperty("--dc-spot-amp", String(strength))
    this.root.classList.remove("dc-spot-on")
    // Reading layout between the two class changes makes the browser see the
    // removal, so the animations start over instead of carrying on.
    void this.root.offsetWidth
    this.root.classList.add("dc-spot-on")
  }

  clear(): void {
    this.root.classList.remove("dc-spot-on")
  }
}
