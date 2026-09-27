// ── CapturePanel ─────────────────────────────────────────────────────────────
// Owns: the expandable check-in panel that slides below the card — how you
// feel (a beat), how you rate it, and whether you'll finish it.
// Does NOT know about card size, slideshow, or drag.
// Parent calls: open(), close(), isOpen, setVerdicts().
//
// Lifetimes (Charter §8): the auto-close timer is the owner's — a panel torn
// down with its card leaves nothing scheduled.

import { el } from "@drama/effects/content/dom"
import { MOODS } from "@drama/logic/content/constants"
import { likelihoodGlyph } from "@drama/logic/content/spotlight"
import { likelihoodLabel } from "@drama/logic/content/utils"
import { FINISH_CHOICES, STAR_RATINGS } from "@drama/logic/verdict"
import type { MoodType, VerdictChange, VerdictField } from "@drama/types"
import { Disposables } from "@some-extension/common"

const CLOSE_DELAY_MS = 800

export class CapturePanel {
  /** Root element — insert above .dc-card in the flex column */
  readonly root: HTMLDivElement

  private emoButtons: Map<MoodType, HTMLButtonElement> = new Map()
  private stars: Array<HTMLButtonElement> = []
  private finishButtons: Array<HTMLButtonElement> = []
  private _isOpen = false

  private readonly life: Disposables
  private closing: Disposables | null = null

  /** Fired after user selects an emotion */
  onMoodSelect?: (mood: MoodType) => void
  /** Fired after user picks a star or a finish choice */
  onVerdict?: (field: VerdictField, change: VerdictChange) => void

  /** `owner`: the card's lifetime; the auto-close timer ends with it. */
  constructor(owner?: Disposables) {
    this.life = owner ? owner.child() : new Disposables()
    this.root = el("div", "dc-capture-panel")

    const inner = el("div", "dc-capture-inner flex flex-col")

    const title = el("div", "dc-panel-title")
    title.textContent = "how are you feeling right now?"

    const grid = el("div", "dc-emotion-grid flex flex-wrap gap-2.5")
    MOODS.forEach((m) => {
      const btn = el("button", "dc-emo-btn flex items-center justify-center")
      btn.textContent = m.emoji
      btn.title = m.label
      btn.addEventListener("click", (e) => {
        e.stopPropagation()
        this.selectMood(m.type)
      })
      this.emoButtons.set(m.type, btn)
      grid.appendChild(btn)
    })

    inner.append(title, grid, this.buildRatingRow(), this.buildFinishRow())
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
    this.closing?.dispose()
    this.closing = null
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

  /** Show the current rating and likelihood to finish on the controls. */
  setVerdicts(rating: number, completionLikelihood: number): void {
    const filled = Math.round(rating / 2)
    this.stars.forEach((s, i) => s.classList.toggle("dc-star-on", i < filled))
    const current = likelihoodLabel(completionLikelihood)
    this.finishButtons.forEach((b, i) =>
      b.classList.toggle(
        "dc-finish-on",
        likelihoodLabel(FINISH_CHOICES[i] ?? 0) === current
      )
    )
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  private buildRatingRow(): HTMLDivElement {
    const row = el("div", "dc-verdict-row flex items-center gap-2")
    const label = el("span", "dc-verdict-label")
    label.textContent = "rating"
    const stars = el("div", "dc-stars flex")
    STAR_RATINGS.forEach((value) => {
      const star = el("button", "dc-star")
      star.textContent = "★"
      star.title = `${value} / 10`
      star.addEventListener("click", (e) => {
        e.stopPropagation()
        this.pick("rating", value)
      })
      this.stars.push(star)
      stars.appendChild(star)
    })
    row.append(label, stars)
    return row
  }

  private buildFinishRow(): HTMLDivElement {
    const row = el("div", "dc-verdict-row flex items-center gap-2")
    const label = el("span", "dc-verdict-label")
    label.textContent = "finish?"
    const choices = el("div", "dc-finish-choices flex gap-1.5")
    FINISH_CHOICES.forEach((value) => {
      const btn = el("button", "dc-finish-btn flex items-center justify-center")
      btn.textContent = likelihoodGlyph(value)
      btn.title = likelihoodLabel(value)
      btn.addEventListener("click", (e) => {
        e.stopPropagation()
        this.pick("completionLikelihood", value)
      })
      this.finishButtons.push(btn)
      choices.appendChild(btn)
    })
    row.append(label, choices)
    return row
  }

  private pick(field: VerdictField, value: number): void {
    this.onVerdict?.(field, { set: value })
    this.closeSoon()
  }

  private selectMood(mood: MoodType): void {
    // Highlight selected button
    this.emoButtons.forEach((b, k) =>
      b.classList.toggle("dc-emo-selected", k === mood)
    )
    this.onMoodSelect?.(mood)
    this.closeSoon()
  }

  /** Auto-close after brief feedback; another pick restarts the delay. */
  private closeSoon(): void {
    this.closing?.dispose()
    const closing = this.life.child()
    this.closing = closing
    closing.timeout(() => this.close(), CLOSE_DELAY_MS)
  }
}
