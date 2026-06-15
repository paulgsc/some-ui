/**
 * Builds the Drama Journal Authoring UI v2.
 *
 * This screen acts as a focused authoring tool optimized for low friction,
 * memory recall, and quick completion. It follows a guided interview/notebook
 * sequence: Scenes → Feelings → Interpretations.
 *
 * Advanced telemetry widgets are hidden inside a collapsed-by-default sub-panel.
 */

import type { DramaEntry, MomentTag } from "@drama/types"

type El = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string
) => HTMLElementTagNameMap[K]

// ── Tag Configuration ──────────────────────────────────────────────────────
const ALL_TAGS: ReadonlyArray<MomentTag> = [
  "confession",
  "reunion",
  "betrayal",
  "sacrifice",
  "separation",
  "kiss",
  "rivalry",
  "other",
] as const

const TAG_LABELS: Record<MomentTag, string> = {
  confession: "Confession",
  reunion: "Reunion",
  betrayal: "Betrayal",
  sacrifice: "Sacrifice",
  separation: "Separation",
  kiss: "First Kiss",
  rivalry: "Rivalry",
  other: "Family Conflict", // remapped / extended per spec example
}

type Direction = "rising" | "steady" | "falling"

export type OpinionatedFieldRefs = {
  getDramaTitle: () => string
  getEpisodeNumber: () => number
  getWatchDate: () => string
  getTags: () => Array<MomentTag>
  getTransitions: () => Array<{ before: string; after: string }>
  getWhyItRimmed: () => string
  getQuote: () => string
  getRating: () => number
  getMomentum: () => Direction
  getLikelihood: () => number
  getOverallProgress: () => number
}

export function buildOpinionatedSection(
  el: El,
  prefill: Partial<DramaEntry>
): { root: HTMLElement; refs: OpinionatedFieldRefs } {
  const root = el("div", "dj-authoring-container")
  const inner = el("div", "dj-notebook")
  root.appendChild(inner)

  // ──────────────────────────────────────────────────────────────────────────
  // Section 1: Episode Metadata
  // ──────────────────────────────────────────────────────────────────────────
  const metaSection = el("div", "dj-section dj-metadata")

  const titleInput = el("input", "dj-input-text dj-meta-title")
  titleInput.type = "text"
  titleInput.placeholder = "Drama Title"
  titleInput.value = prefill.title ?? ""

  const epInput = el("input", "dj-input-text dj-meta-ep")
  epInput.type = "number"
  epInput.placeholder = "Ep #"
  epInput.value = prefill.episode ? String(prefill.episode) : ""

  const dateInput = el("input", "dj-input-text dj-meta-date")
  dateInput.type = "date"
  // Default to today if not provided
  dateInput.value = prefill.watchDate ?? new Date().toISOString().split("T")[0]

  metaSection.appendChild(titleInput)
  metaSection.appendChild(epInput)
  metaSection.appendChild(dateInput)
  inner.appendChild(metaSection)

  // ──────────────────────────────────────────────────────────────────────────
  // Section 2: What Happened? (Key Moments)
  // ──────────────────────────────────────────────────────────────────────────
  const happenedSection = el("div", "dj-section")
  const happenedPrompt = el("label", "dj-prompt")
  happenedPrompt.textContent = "What happened in this episode?"
  happenedSection.appendChild(happenedPrompt)

  const selectedTags = new Set<MomentTag>(prefill.tags ?? [])
  const tagGrid = el("div", "dj-tag-grid")

  ALL_TAGS.forEach((tag) => {
    const label = el("label", "dj-tag-label-checkbox")
    const cb = el("input")
    cb.type = "checkbox"
    cb.checked = selectedTags.has(tag)

    const span = el("span")
    span.textContent = ` ${TAG_LABELS[tag]}`

    label.appendChild(cb)
    label.appendChild(span)
    tagGrid.appendChild(label)

    cb.addEventListener("change", () => {
      if (cb.checked) selectedTags.add(tag)
      else selectedTags.delete(tag)
      updateLivePreview()
    })
  })
  happenedSection.appendChild(tagGrid)
  inner.appendChild(happenedSection)

  // ──────────────────────────────────────────────────────────────────────────
  // Section 3: What Changed? (Transitions Engine)
  // ──────────────────────────────────────────────────────────────────────────
  const changedSection = el("div", "dj-section dj-transitions-section")
  const changedPrompt = el("label", "dj-prompt")
  changedPrompt.textContent = "What changed?"
  changedSection.appendChild(changedPrompt)

  const transContainer = el("div", "dj-transitions-container")
  changedSection.appendChild(transContainer)

  const createTransitionRow = (beforeVal = "", afterVal = "") => {
    const row = el("div", "dj-transition-row")

    const beforeIn = el("input", "dj-trans-input")
    beforeIn.placeholder = "Before"
    beforeIn.value = beforeVal

    const arrow = el("span", "dj-trans-arrow")
    arrow.textContent = "→"

    const afterIn = el("input", "dj-trans-input")
    afterIn.placeholder = "After"
    afterIn.value = afterVal

    row.appendChild(beforeIn)
    row.appendChild(arrow)
    row.appendChild(afterIn)

    const triggerUpdate = () => updateLivePreview()
    beforeIn.addEventListener("input", triggerUpdate)
    afterIn.addEventListener("input", triggerUpdate)

    return row
  }

  // Seed initial values or at least one empty row
  if (prefill.transitions && prefill.transitions.length > 0) {
    prefill.transitions.forEach((t) =>
      transContainer.appendChild(createTransitionRow(t.before, t.after))
    )
  } else if (prefill.transition) {
    // fall back to single legacy transition structure
    transContainer.appendChild(
      createTransitionRow(prefill.transition.before, prefill.transition.after)
    )
  } else {
    transContainer.appendChild(createTransitionRow())
  }

  const addTransBtn = el("button", "dj-btn-secondary")
  addTransBtn.textContent = "+ Add Transition"
  addTransBtn.type = "button"
  addTransBtn.addEventListener("click", () => {
    transContainer.appendChild(createTransitionRow())
  })
  changedSection.appendChild(addTransBtn)
  inner.appendChild(changedSection)

  // ──────────────────────────────────────────────────────────────────────────
  // Section 4: Why Did It Matter?
  // ──────────────────────────────────────────────────────────────────────────
  const matterSection = el("div", "dj-section")
  const matterPrompt = el("label", "dj-prompt")
  matterPrompt.textContent = "What made this episode memorable?"

  const matterText = el("textarea", "dj-textarea")
  matterText.rows = 3
  matterText.placeholder =
    "The confession finally broke the emotional stalemate..."
  matterText.value = prefill.whyItRimmed ?? "" // mapping internal interpretation back

  matterSection.appendChild(matterPrompt)
  matterSection.appendChild(matterText)
  inner.appendChild(matterSection)

  // ──────────────────────────────────────────────────────────────────────────
  // Section 5: Memorable Quote
  // ──────────────────────────────────────────────────────────────────────────
  const quoteSection = el("div", "dj-section")
  const quotePrompt = el("label", "dj-prompt")
  quotePrompt.textContent = "What line stayed with you?"

  const quoteText = el("textarea", "dj-textarea dj-textarea-quote")
  quoteText.rows = 2
  quoteText.placeholder = '"Stay. Just this once."'
  quoteText.value = prefill.featuredQuote ?? ""

  quoteSection.appendChild(quotePrompt)
  quoteSection.appendChild(quoteText)
  inner.appendChild(quoteSection)

  // ──────────────────────────────────────────────────────────────────────────
  // Section 6: Live Preview Card
  // ──────────────────────────────────────────────────────────────────────────
  const previewSection = el("div", "dj-section dj-preview-section")
  const previewTitle = el("div", "dj-section-label")
  previewTitle.textContent = "Preview Card"
  previewSection.appendChild(previewTitle)

  const cardElement = el("div", "dj-preview-card")
  previewSection.appendChild(cardElement)
  inner.appendChild(previewSection)

  // ──────────────────────────────────────────────────────────────────────────
  // Section 7: Advanced Metrics (Accordion Drawer)
  // ──────────────────────────────────────────────────────────────────────────
  const advancedAccordion = el("details", "dj-advanced-accordion")
  const summaryToggle = el("summary", "dj-advanced-summary")
  summaryToggle.textContent = "Advanced Metrics"
  advancedAccordion.appendChild(summaryToggle)

  const advContent = el("div", "dj-advanced-content")

  // Star Rating (1-5 stars max per spec visualization)
  let currentRating = prefill.rating
    ? Math.min(5, Math.max(1, Math.round(prefill.rating / 2)))
    : 0
  const ratingGroup = el("div", "dj-adv-field")
  const ratingLabel = el("div", "dj-adv-label")
  ratingLabel.textContent = "Rating"
  ratingGroup.appendChild(ratingLabel)

  const starsContainer = el("div", "dj-stars")
  const starButtons: Array<HTMLButtonElement> = []

  const paintStars = (starsCount: number) => {
    starButtons.forEach((btn, index) => {
      btn.textContent = index < starsCount ? "★" : "☆"
      btn.classList.toggle("active", index < starsCount)
    })
  }

  for (let i = 1; i <= 5; i++) {
    const star = el("button", "dj-star-btn")
    star.type = "button"
    star.textContent = "☆"
    star.addEventListener("click", () => {
      currentRating = i
      paintStars(i)
      updateLivePreview()
    })
    starButtons.push(star)
    starsContainer.appendChild(star)
  }
  paintStars(currentRating)
  ratingGroup.appendChild(starsContainer)
  advContent.appendChild(ratingGroup)

  // Momentum (Radio buttons)
  let currentMomentum: Direction = prefill.momentum?.direction ?? "steady"
  const momentumGroup = el("div", "dj-adv-field")
  const momentumLabel = el("div", "dj-adv-label")
  momentumLabel.textContent = "Momentum"
  momentumGroup.appendChild(momentumLabel)

  const directions: Array<Direction> = ["falling", "steady", "rising"]
  directions.forEach((dir) => {
    const label = el("label", "dj-radio-label")
    const radio = el("input")
    radio.type = "radio"
    radio.name = "dj_momentum"
    radio.value = dir
    radio.checked = currentMomentum === dir

    const textNode = document.createTextNode(
      ` ${dir.charAt(0).toUpperCase() + dir.slice(1)}`
    )
    label.appendChild(radio)
    label.appendChild(textNode)
    momentumGroup.appendChild(label)

    radio.addEventListener("change", () => {
      if (radio.checked) currentMomentum = dir
    })
  })
  advContent.appendChild(momentumGroup)

  // Completion Likelihood (Slider 0 - 100)
  const likelihoodGroup = el("div", "dj-adv-field")
  const likelihoodLabel = el("div", "dj-adv-label")
  likelihoodLabel.textContent = "Completion Likelihood"
  likelihoodGroup.appendChild(likelihoodLabel)

  const sliderWrapper = el("div", "dj-slider-wrap")
  const likelihoodSlider = el("input", "dj-slider")
  likelihoodSlider.type = "range"
  likelihoodSlider.min = "0"
  likelihoodSlider.max = "100"
  likelihoodSlider.value = String(
    prefill.completionLikelihood
      ? Math.round(prefill.completionLikelihood * 100)
      : 50
  )

  const sliderValText = el("span", "dj-slider-val-indicator")
  sliderValText.textContent = `${likelihoodSlider.value}%`

  likelihoodSlider.addEventListener("input", () => {
    sliderValText.textContent = `${likelihoodSlider.value}%`
    updateLivePreview()
  })

  sliderWrapper.appendChild(likelihoodSlider)
  sliderWrapper.appendChild(sliderValText)
  likelihoodGroup.appendChild(sliderWrapper)
  advContent.appendChild(likelihoodGroup)

  // Episode Progress
  const progressGroup = el("div", "dj-adv-field")
  const progressLabel = el("div", "dj-adv-label")
  progressLabel.textContent = "Episode Progress"
  progressGroup.appendChild(progressLabel)

  const progressWrap = el("div", "dj-progress-inputs")
  const currentEpNum = el("input", "dj-input-text inline-ep")
  currentEpNum.type = "number"
  currentEpNum.value = epInput.value

  const separator = el("span")
  separator.textContent = " / "

  const totalEpNum = el("input", "dj-input-text inline-ep")
  totalEpNum.type = "number"
  totalEpNum.value = "16" // sensible default

  progressWrap.appendChild(currentEpNum)
  progressWrap.appendChild(separator)
  progressWrap.appendChild(totalEpNum)
  progressGroup.appendChild(progressWrap)
  advContent.appendChild(progressGroup)

  advancedAccordion.appendChild(advContent)
  inner.appendChild(advancedAccordion)

  // Sync structural components together
  epInput.addEventListener("input", () => {
    currentEpNum.value = epInput.value
    updateLivePreview()
  })
  titleInput.addEventListener("input", () => updateLivePreview())

  // ──────────────────────────────────────────────────────────────────────────
  // Live Preview Sync Renderer Layer
  // ──────────────────────────────────────────────────────────────────────────
  function updateLivePreview() {
    cardElement.innerHTML = ""

    // Line 1: Identity / Meta Context
    const metaLine = el("div", "card-meta-line")
    const titleText = titleInput.value.trim() || "Untitled Drama"
    const epText = epInput.value ? `Episode ${epInput.value}` : "Exp. Episode"
    metaLine.textContent = `${titleText} — ${epText}`
    cardElement.appendChild(metaLine)

    // Line 2: The Core Transitions (Heart of the journal layout)
    const activeTransitions: Array<string> = []
    transContainer.querySelectorAll(".dj-transition-row").forEach((row) => {
      const inputs = row.querySelectorAll("input")
      const b = inputs[0].value.trim()
      const a = inputs[1].value.trim()
      if (b || a) {
        activeTransitions.push(`${b || "?"} → ${a || "?"}`)
      }
    })

    if (activeTransitions.length > 0) {
      const transLine = el("div", "card-transitions-line")
      transLine.textContent = activeTransitions.join(" | ")
      cardElement.appendChild(transLine)
    }

    // Line 3: Active Moments Grid
    if (selectedTags.size > 0) {
      const chipsLine = el("div", "card-chips-line")
      Array.from(selectedTags).forEach((tag) => {
        const chip = el("span", "card-chip")
        chip.textContent = TAG_LABELS[tag]
        chipsLine.appendChild(chip)
      })
      cardElement.appendChild(chipsLine)
    }

    // Line 4: Star Indicator
    const starsLine = el("div", "card-stars-line")
    let renderingStars = ""
    for (let i = 1; i <= 5; i++) {
      renderingStars += i <= currentRating ? "★" : "☆"
    }
    starsLine.textContent = renderingStars
    cardElement.appendChild(starsLine)
  }

  // Perform immediate initial layout paint
  updateLivePreview()

  return {
    root,
    refs: {
      getDramaTitle: () => titleInput.value.trim(),
      getEpisodeNumber: () => Number(epInput.value),
      getWatchDate: () => dateInput.value,
      getTags: () => Array.from(selectedTags),
      getTransitions: () => {
        const rows: Array<{ before: string; after: string }> = []
        transContainer.querySelectorAll(".dj-transition-row").forEach((row) => {
          const inputs = row.querySelectorAll("input")
          rows.push({
            before: inputs[0].value.trim(),
            after: inputs[1].value.trim(),
          })
        })
        return rows
      },
      getWhyItRimmed: () => matterText.value.trim(),
      getQuote: () => quoteText.value.trim(),
      getRating: () => currentRating * 2, // normalized back to a 10 point model if required downstream
      getMomentum: () => currentMomentum,
      getLikelihood: () => Number(likelihoodSlider.value) / 100,
      getOverallProgress: () => {
        const current = Number(currentEpNum.value) || 0
        const total = Number(totalEpNum.value) || 1
        return current / total
      },
    },
  }
}
