
// ── RightPanel ────────────────────────────────────────────────────────────────
// Owns: episode badge, timestamp, progress bar, stat values, mood dot strip.
// Does NOT know about drag, size cycling, or slideshow.
// Parent calls: applyState(), setMoodActive().

import { MOODS } from "@drama/lib/content/constants"
import { clamp, el, likelihoodLabel } from "@drama/lib/content/utils"
import type { CardState, MoodType } from "@drama/types"

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
    this.root = el("div", "dc-card-right")

    // Episode + timestamp
    const epRow = el("div", "dc-ep-row")
    this.epBadge = el("span", "dc-ep-badge")
    this.timestampEl = el("span", "dc-timestamp")
    epRow.appendChild(this.epBadge)
    epRow.appendChild(this.timestampEl)

    // Progress bar
    const progWrap = el("div", "dc-progress-wrap")
    const progLabels = el("div", "dc-progress-labels")
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
    this.epBadge.textContent = s.episode
    this.timestampEl.textContent = s.timestamp

    const pct = clamp(s.progress, 0, 1) * 100
    this.progressFill.style.setProperty("--dc-prog-pct", `${pct.toFixed(1)}%`)

    const oPct = Math.round(clamp(s.overallProgress, 0, 1) * 100)
    this.progressLabelLeft.textContent = "episode progress"
    this.progressLabelRight.textContent = `${oPct}% overall`

    this.statRating.textContent = `${s.rating.toFixed(1)} / 10`
    this.statLikelihood.textContent = likelihoodLabel(s.completionLikelihood)

    if (s.activeMood) this.setMoodActive(s.activeMood)
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
    const row = el("div", "dc-stats-row")

    const makestat = (labelText: string): HTMLSpanElement => {
      const wrap = el("div", "dc-stat")
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
    const strip = el("div", "dc-mood-strip")
    this.moodLabel = el("span", "dc-mood-label")

    MOODS.forEach((m) => {
      const dot = el("span", "dc-mood-dot")
      dot.title = m.label
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
