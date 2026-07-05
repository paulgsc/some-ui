// ── AdvancedMetrics ──────────────────────────────────────────────────────────
// Tabbed: Metrics | Prediction | Progress. Owns rating stars, momentum,
// completion likelihood, episode progress, and the four emotional axes
// (so getAxes() in popup-renderer has a UI to back it).

import { el } from "@drama/effects/content/dom"
import type { DramaEntryOpinionated } from "@drama/types"

import type { JournalDraft } from "../use-drama-journal-state"

type Direction = DramaEntryOpinionated["momentum"]["direction"]
type AxisKey = keyof DramaEntryOpinionated["axes"]

const AXIS_LABELS: Record<AxisKey, { pos: string; neg: string }> = {
  connection: { pos: "Connection", neg: "Separation" },
  hope: { pos: "Hope", neg: "Despair" },
  trust: { pos: "Trust", neg: "Betrayal" },
  control: { pos: "Control", neg: "Helplessness" },
}

const AXIS_ORDER: ReadonlyArray<AxisKey> = [
  "connection",
  "hope",
  "trust",
  "control",
]

export function buildAdvancedMetrics(
  value: Pick<
    JournalDraft,
    | "rating"
    | "momentum"
    | "completionLikelihood"
    | "axes"
    | "peakLine"
    | "currentEpisode"
    | "totalEpisodes"
  >,
  onChange: (patch: Partial<JournalDraft>) => void
): { root: HTMLDivElement } {
  const root = el("div", "dj-advanced")

  // ── Tab bar ────────────────────────────────────────────────────────────────
  const tabBar = el("div", "dj-adv-tabs flex gap-1")
  const tabs = ["Metrics", "Prediction", "Progress"] as const
  const tabButtons = tabs.map((label, i) => {
    const btn = el("button", `dj-adv-tab${i === 0 ? " dj-adv-tab-active" : ""}`)
    btn.type = "button"
    btn.textContent = label
    tabBar.appendChild(btn)
    return btn
  })
  root.appendChild(tabBar)

  const panels = tabs.map((_, i) => {
    const p = el(
      "div",
      `dj-adv-panel flex-col gap-5${i === 0 ? " dj-adv-panel-active" : ""}`
    )
    return p
  })

  tabButtons.forEach((btn, i) => {
    btn.addEventListener("click", () => {
      tabButtons.forEach((b, j) =>
        b.classList.toggle("dj-adv-tab-active", j === i)
      )
      panels.forEach((p, j) =>
        p.classList.toggle("dj-adv-panel-active", j === i)
      )
    })
  })

  // ── Panel 0: Metrics (rating + peak line) ──────────────────────────────────
  const ratingGroup = el("div", "dj-adv-field flex flex-col gap-1.5")
  const ratingLabel = el("div", "dj-adv-label")
  ratingLabel.textContent = "Rating"
  ratingGroup.appendChild(ratingLabel)

  const starsContainer = el("div", "dj-stars flex gap-1")
  const starButtons: Array<HTMLButtonElement> = []
  let currentRating = Math.min(5, Math.max(0, Math.round(value.rating / 2)))

  const paintStars = (count: number): void => {
    starButtons.forEach((btn, i) => {
      btn.textContent = i < count ? "★" : "☆"
      btn.classList.toggle("active", i < count)
    })
  }

  for (let i = 1; i <= 5; i++) {
    const star = el("button", "dj-star-btn")
    star.type = "button"
    star.textContent = "☆"
    star.addEventListener("click", () => {
      currentRating = i
      paintStars(i)
      star.classList.add("dj-star-pop")
      star.addEventListener(
        "animationend",
        () => star.classList.remove("dj-star-pop"),
        {
          once: true,
        }
      )
      onChange({ rating: currentRating * 2 })
    })
    starButtons.push(star)
    starsContainer.appendChild(star)
  }
  paintStars(currentRating)
  ratingGroup.appendChild(starsContainer)
  panels[0]!.appendChild(ratingGroup)

  const peakGroup = el("div", "dj-adv-field")
  const peakLabel = el("div", "dj-adv-label")
  peakLabel.textContent = "Peak Moment"
  const peakInput = el("input", "dj-input-text")
  peakInput.type = "text"
  peakInput.placeholder = "The umbrella scene in the rain"
  peakInput.value = value.peakLine
  peakInput.addEventListener("input", () =>
    onChange({ peakLine: peakInput.value })
  )
  peakGroup.appendChild(peakLabel)
  peakGroup.appendChild(peakInput)
  panels[0]!.appendChild(peakGroup)

  // ── Panel 1: Prediction (momentum + likelihood) ────────────────────────────
  const momentumGroup = el("div", "dj-adv-field")
  const momentumLabel = el("div", "dj-adv-label")
  momentumLabel.textContent = "Momentum"
  momentumGroup.appendChild(momentumLabel)

  const directions: Array<Direction> = ["falling", "steady", "rising"]
  directions.forEach((dir) => {
    const label = el("label", "dj-radio-label inline-flex items-center")
    const radio = el("input")
    radio.type = "radio"
    radio.name = "dj_momentum"
    radio.value = dir
    radio.checked = value.momentum.direction === dir

    const textNode = document.createTextNode(
      ` ${dir.charAt(0).toUpperCase() + dir.slice(1)}`
    )
    label.appendChild(radio)
    label.appendChild(textNode)
    momentumGroup.appendChild(label)

    radio.addEventListener("change", () => {
      if (radio.checked) {
        onChange({ momentum: { ...value.momentum, direction: dir } })
      }
    })
  })
  panels[1]!.appendChild(momentumGroup)

  const likelihoodGroup = el("div", "dj-adv-field")
  const likelihoodLabel = el("div", "dj-adv-label")
  likelihoodLabel.textContent = "Completion Likelihood"
  likelihoodGroup.appendChild(likelihoodLabel)

  const sliderWrapper = el("div", "dj-slider-wrap flex items-center gap-3")
  const likelihoodSlider = el("input", "dj-slider")
  likelihoodSlider.type = "range"
  likelihoodSlider.min = "0"
  likelihoodSlider.max = "100"
  likelihoodSlider.value = String(Math.round(value.completionLikelihood * 100))

  const sliderValText = el("span", "dj-slider-val-indicator")
  sliderValText.textContent = `${likelihoodSlider.value}%`

  likelihoodSlider.addEventListener("input", () => {
    sliderValText.textContent = `${likelihoodSlider.value}%`
    onChange({ completionLikelihood: Number(likelihoodSlider.value) / 100 })
  })

  sliderWrapper.appendChild(likelihoodSlider)
  sliderWrapper.appendChild(sliderValText)
  likelihoodGroup.appendChild(sliderWrapper)
  panels[1]!.appendChild(likelihoodGroup)

  // ── Panel 1: emotional axes ─────────────────────────────────────────────────
  const axisGrid = el("div", "dj-axis-grid flex flex-col gap-3.5")
  AXIS_ORDER.forEach((key) => {
    const row = el("div", "dj-axis-row flex flex-col gap-1")
    const labels = el("div", "dj-axis-row-labels flex justify-between")
    const negLabel = el("span")
    negLabel.textContent = AXIS_LABELS[key].neg
    const posLabel = el("span")
    posLabel.textContent = AXIS_LABELS[key].pos
    labels.appendChild(negLabel)
    labels.appendChild(posLabel)

    const slider = el("input", "dj-axis-slider")
    slider.type = "range"
    slider.min = "-100"
    slider.max = "100"
    slider.value = String(value.axes[key])
    slider.addEventListener("input", () => {
      onChange({ axes: { ...value.axes, [key]: Number(slider.value) } })
    })

    row.appendChild(labels)
    row.appendChild(slider)
    axisGrid.appendChild(row)
  })
  panels[1]!.appendChild(axisGrid)

  // ── Panel 2: Progress ────────────────────────────────────────────────────────
  const progressGroup = el("div", "dj-adv-field")
  const progressLabel = el("div", "dj-adv-label")
  progressLabel.textContent = "Episode Progress"
  progressGroup.appendChild(progressLabel)

  const progressWrap = el("div", "dj-progress-inputs flex items-center gap-2")
  const currentEpNum = el("input", "dj-input-text inline-ep")
  currentEpNum.type = "number"
  currentEpNum.value = String(value.currentEpisode)
  currentEpNum.addEventListener("input", () => {
    onChange({ currentEpisode: Number(currentEpNum.value) || 0 })
  })

  const separator = el("span")
  separator.textContent = " / "

  const totalEpNum = el("input", "dj-input-text inline-ep")
  totalEpNum.type = "number"
  totalEpNum.value = String(value.totalEpisodes)
  totalEpNum.addEventListener("input", () => {
    onChange({ totalEpisodes: Number(totalEpNum.value) || 1 })
  })

  progressWrap.appendChild(currentEpNum)
  progressWrap.appendChild(separator)
  progressWrap.appendChild(totalEpNum)
  progressGroup.appendChild(progressWrap)
  panels[2]!.appendChild(progressGroup)

  panels.forEach((p) => root.appendChild(p))

  return { root }
}
