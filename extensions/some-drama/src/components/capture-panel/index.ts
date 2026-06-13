// ── CapturePanel ─────────────────────────────────────────────────────────────
// Owns: the expandable emotion-picker panel that slides below the card.
// Does NOT know about card size, slideshow, or drag.
// Parent calls: open(), close(), isOpen.

import { MOODS } from "@drama/lib/content/constants"
import { el } from "@drama/lib/content/utils"
import type { MoodType } from "@drama/types"

const CLOSE_DELAY_MS = 800

export class CapturePanel {
  /** Root element — insert above .dc-card in the flex column */
  readonly root: HTMLDivElement

  private emoButtons: Map<MoodType, HTMLButtonElement> = new Map()
  private _isOpen = false

  /** Fired after user selects an emotion */
  onMoodSelect?: (mood: MoodType) => void

  constructor() {
    this.root = el("div", "dc-capture-panel")

    const inner = el("div", "dc-capture-inner")
    const title = el("div", "dc-panel-title")
    title.textContent = "how are you feeling right now?"

    const grid = el("div", "dc-emotion-grid")

    MOODS.forEach((m) => {
      const btn = el("button", "dc-emo-btn")
      btn.textContent = m.emoji
      btn.title = m.label
      btn.addEventListener("click", (e) => {
        e.stopPropagation()
        this.selectMood(m.type)
      })
      this.emoButtons.set(m.type, btn)
      grid.appendChild(btn)
    })

    inner.appendChild(title)
    inner.appendChild(grid)
    this.root.appendChild(inner)
  }

  // ── Public interface ────────────────────────────────────────────────────────

  get isOpen(): boolean {
    return this._isOpen
  }

  open(): void {
    this._isOpen = true
    this.root.classList.add("dc-panel-open")
  }

  close(): void {
    this._isOpen = false
    this.root.classList.remove("dc-panel-open")
    this.emoButtons.forEach((b) => b.classList.remove("dc-emo-selected"))
  }

  toggle(): void {
    if (this._isOpen) {
      this.close()
    } else {
      this.open()
    }
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  private selectMood(mood: MoodType): void {
    // Highlight selected button
    this.emoButtons.forEach((b, k) =>
      b.classList.toggle("dc-emo-selected", k === mood)
    )
    this.onMoodSelect?.(mood)
    // Auto-close after brief feedback delay
    setTimeout(() => this.close(), CLOSE_DELAY_MS)
  }
}
