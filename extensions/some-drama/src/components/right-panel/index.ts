// ── RightPanel ────────────────────────────────────────────────────────────────
// Owns: episode badge, timestamp, progress bar, stat values, mood dot strip.
// Does NOT know about drag, size cycling, or slideshow.
// Parent calls: applyState(), setMoodActive().

import { el } from "@drama/effects/content/dom"
import { MOODS } from "@drama/logic/content/constants"
import { clamp, likelihoodLabel } from "@drama/logic/content/utils"
import type { CardState, MoodType } from "@drama/types"

/** Set `text`, and play the stat's bump when it actually changed. */
function setBumped(value: HTMLSpanElement, text: string): void {
  if (value.textContent === text) return
  const first = value.textContent === ""
  value.textContent = text
  if (first) return
  value.classList.remove("dc-stat-bump")
  // A layout read between the class changes restarts the animation.
  void value.offsetWidth
  value.classList.add("dc-stat-bump")
}

export class RightPanel {
  /** Root element — append to .dc-card */
  readonly root: HTMLDivElement

  private epBadge: HTMLSpanElement
  private timestampEl: HTMLSpanElement
  private progressFill: HTMLDivElement
  private progressLabelLeft: HTMLSpanElement
  private progressLabelRight: HTMLSpanElement
  // Fields initialized inside buildStatsRow() called from constructor
  private statRating!: HTMLSpanElement
  private statLikelihood!: HTMLSpanElement
  private moodDots: Map<MoodType, HTMLSpanElement> = new Map()
  // Field initialized inside buildMoodStrip() called from constructor
  private moodLabel!: HTMLSpanElement

  /** Fired when user clicks a mood dot */
  onMoodSelect?: (mood: MoodType) => void

  constructor() {
    this.root = el("div", "dc-card-right flex flex-col gap-3")

    // Episode + timestamp
    const epRow = el("div", "dc-ep-row flex items-center gap-2.5")
    this.epBadge = el("span", "dc-ep-badge")
    this.timestampEl = el("span", "dc-timestamp")
    epRow.appendChild(this.epBadge)
    epRow.appendChild(this.timestampEl)

    // Progress bar
    const progWrap = el("div", "dc-progress-wrap flex flex-col")
    const progLabels = el("div", "dc-progress-labels flex justify-between")
    this.progressLabelLeft = el("span")
    this.progressLabelRight = el("span")
    progLabels.appendChild(this.progressLabelLeft)
    progLabels.appendChild(this.progressLabelRight)

    const track = el("div", "dc-progress-track")
    this.progressFill = el("div", "dc-progress-fill")
    track.appendChild(this.progressFill)
    progWrap.appendChild(progLabels)
    progWrap.appendChild(track)

    // Stats — assigns this.statRating / this.statLikelihood
    const statsRow = this.buildStatsRow()

    // Mood strip — assigns this.moodLabel
    const moodStrip = this.buildMoodStrip()

    this.root.appendChild(epRow)
    this.root.appendChild(progWrap)
    this.root.appendChild(statsRow)
    this.root.appendChild(moodStrip)
  }

  // ── Public interface ────────────────────────────────────────────────────────

  applyState(s: CardState): void {
    this.setPosition(s)

    const oPct = Math.round(clamp(s.overallProgress, 0, 1) * 100)
    this.progressLabelLeft.textContent = "episode progress"
    this.progressLabelRight.textContent = `${oPct}% overall`

    setBumped(this.statRating, `${s.rating.toFixed(1)} / 10`)
    setBumped(this.statLikelihood, likelihoodLabel(s.completionLikelihood))

    if (s.activeMood) this.setMoodActive(s.activeMood)
  }

  /** Where the drama is: the entry's saved position, or the live one. */
  setPosition(p: {
    episode: string
    timestamp: string
    progress: number
  }): void {
    this.epBadge.textContent = p.episode
    this.timestampEl.textContent = p.timestamp
    const pct = clamp(p.progress, 0, 1) * 100
    this.progressFill.style.setProperty("--dc-prog-pct", `${pct.toFixed(1)}%`)
  }

  setMoodActive(mood: MoodType): void {
    this.moodDots.forEach((dot, key) =>
      dot.classList.toggle("dc-mood-active", key === mood)
    )
    const m = MOODS.find((x) => x.type === mood)
    if (m) this.moodLabel.textContent = m.label
  }

  // ── DOM builders ────────────────────────────────────────────────────────────

  private buildStatsRow(): HTMLDivElement {
    const row = el("div", "dc-stats-row flex flex-wrap gap-3.5")

    const makestat = (labelText: string): HTMLSpanElement => {
      const wrap = el("div", "dc-stat flex flex-col")
      const label = el("span", "dc-stat-label")
      const value = el("span", "dc-stat-value")
      label.textContent = labelText
      wrap.appendChild(label)
      wrap.appendChild(value)
      row.appendChild(wrap)
      return value
    }

    this.statRating = makestat("Rating")
    this.statLikelihood = makestat("Finish?")
    return row
  }

  private buildMoodStrip(): HTMLDivElement {
    const strip = el("div", "dc-mood-strip flex items-center gap-1.5")
    this.moodLabel = el("span", "dc-mood-label")

    MOODS.forEach((m) => {
      const dot = el("span", "dc-mood-dot")
      dot.title = m.label
      // Each dot in its own mood's colour, whatever the card's theme is.
      dot.style.setProperty("--dc-dot-hue", String(m.hue))
      dot.addEventListener("click", (e) => {
        e.stopPropagation()
        this.onMoodSelect?.(m.type)
      })
      this.moodDots.set(m.type, dot)
      strip.appendChild(dot)
    })

    strip.appendChild(this.moodLabel)
    return strip
  }
}
