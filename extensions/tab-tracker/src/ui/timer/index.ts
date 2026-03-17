
import type { BadgeTier } from "@tab/types"

const TIER_COLORS: Record<BadgeTier, string> = {
  green: "rgba(255,255,255,0.90)",
  amber: "#fcd34d",
  red: "#fca5a5",
  violet: "#c084fc",
}

export class Timer {
  private el: HTMLElement

  constructor() {
    this.el = document.createElement("div")
    this.el.className = "__tl_timer"
    this.el.textContent = "00:00"
  }

  update(text: string, tier: BadgeTier): void {
    this.el.textContent = text
    this.el.style.color = TIER_COLORS[tier]
  }

  getElement(): HTMLElement {
    return this.el
  }
}
