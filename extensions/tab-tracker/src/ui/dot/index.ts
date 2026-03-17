
import type { BadgeTier } from "@tab/types"
import { BADGE_COLORS } from "@tab/types"

export interface DotOptions {
  tier?: BadgeTier
  pulsing?: boolean
}

export class Dot {
  private el: HTMLElement

  constructor(options: DotOptions = {}) {
    this.el = document.createElement("div")
    this.el.className = "__tl_dot"
    this.applyOptions(options)
  }

  private applyOptions(options: DotOptions): void {
    const { tier = "green", pulsing = true } = options
    this.el.style.backgroundColor = BADGE_COLORS[tier]
    if (pulsing) {
      this.el.classList.add("pulsing")
    } else {
      this.el.classList.remove("pulsing")
    }
  }

  update(tier: BadgeTier, pulsing: boolean): void {
    this.el.style.backgroundColor = BADGE_COLORS[tier]
    this.el.style.transition = "background-color 0.8s ease"
    if (pulsing) {
      this.el.classList.add("pulsing")
    } else {
      this.el.classList.remove("pulsing")
    }
  }

  getElement(): HTMLElement {
    return this.el
  }
}
