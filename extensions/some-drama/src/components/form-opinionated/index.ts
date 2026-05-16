/**
 *
 * Builds the opinionated / ephemeral section of the entry form.
 * These fields capture how you feel right now:
 * rating, likelihood, mood, quote, emotion label, and overall progress.
 *
 * Visual contract:
 *  - Hazy gradient background (rose → violet tones)
 *  - Animated shimmer on the section header
 *  - Star rating via clickable glyphs
 *  - Likelihood slider with live gradient fill
 *  - Mood chip row (single-select)
 *  - Featured quote textarea
 *  - Emotion label freeform tag
 */

import type { DramaEntry, MoodType } from "@drama/types"

type El = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string
) => HTMLElementTagNameMap[K]

const MOOD_META: Record<MoodType, { emoji: string; label: string }> = {
  joy: { emoji: "✨", label: "Joy" },
  love: { emoji: "💗", label: "Love" },
  sadness: { emoji: "🌧", label: "Sad" },
  tension: { emoji: "⚡", label: "Tension" },
  cringe: { emoji: "😬", label: "Cringe" },
  neutral: { emoji: "〰️", label: "Meh" },
}

export type OpinionatedFieldRefs = {
  getRating: () => number
  getLikelihood: () => number
  getMood: () => MoodType | null
  getQuote: () => string
  getEmotionLabel: () => string
  getOverallProgress: () => number
}

export function buildOpinionatedSection(
  el: El,
  prefill: Partial<DramaEntry>
): { root: HTMLElement; refs: OpinionatedFieldRefs } {
  const root = el("div", "pf-mood")

  /* ────────────────────────────────────────────────────────
     Section Header
  ───────────────────────────────────────────────────────── */

  const header = el("div", "pf-mood-header")
  header.innerHTML = '<span class="pf-mood-header-shimmer">✦ this moment</span>'

  root.appendChild(header)

  /* ────────────────────────────────────────────────────────
     Star Rating
  ───────────────────────────────────────────────────────── */

  let currentRating = Math.round(prefill.rating ?? 0)

  const ratingGroup = el("div", "pf-mood-field")
  const ratingLabel = el("div", "pf-mood-label")

  ratingLabel.textContent = "Rating"

  ratingGroup.appendChild(ratingLabel)

  const stars = el("div", "pf-stars")
  const starEls: Array<HTMLButtonElement> = []

  const paintStars = (n: number) => {
    starEls.forEach((star, i) => {
      star.classList.toggle("pf-star-on", i < n)
    })
  }

  for (let i = 1; i <= 10; i++) {
    const star = el("button", "pf-star")

    star.type = "button"
    star.textContent = "★"
    star.dataset.val = String(i)

    star.addEventListener("click", () => {
      currentRating = i
      paintStars(i)
      ratingValue.textContent = `${currentRating} / 10`
    })

    star.addEventListener("mouseenter", () => {
      paintStars(i)
    })

    star.addEventListener("mouseleave", () => {
      paintStars(currentRating)
    })

    starEls.push(star)
    stars.appendChild(star)
  }

  paintStars(currentRating)

  ratingGroup.appendChild(stars)

  const ratingValue = el("div", "pf-stars-val")

  ratingValue.textContent = currentRating > 0 ? `${currentRating} / 10` : "—"

  ratingGroup.appendChild(ratingValue)

  root.appendChild(ratingGroup)

  /* ────────────────────────────────────────────────────────
     Overall Progress
  ───────────────────────────────────────────────────────── */

  let overallProg = prefill.overallProgress ?? 0

  const progGroup = el("div", "pf-mood-field")
  const progLabel = el("div", "pf-mood-label")

  progLabel.textContent = "Series Progress"

  progGroup.appendChild(progLabel)

  const progSliderWrap = el("div", "pf-slider-wrap")

  const progSlider = el("input", "pf-slider")

  progSlider.type = "range"
  progSlider.min = "0"
  progSlider.max = "100"
  progSlider.value = String(Math.round(overallProg * 100))

  const progDisplay = el("span", "pf-slider-val")

  const updateProgSlider = () => {
    const pct = Number(progSlider.value)

    overallProg = pct / 100

    progDisplay.textContent = `${pct}%`

    progSlider.style.setProperty("--fill", `${pct}%`)
  }

  updateProgSlider()

  progSlider.addEventListener("input", updateProgSlider)

  progSliderWrap.appendChild(progSlider)
  progSliderWrap.appendChild(progDisplay)

  progGroup.appendChild(progSliderWrap)

  root.appendChild(progGroup)

  /* ────────────────────────────────────────────────────────
     Completion Likelihood
  ───────────────────────────────────────────────────────── */

  let likelihood = prefill.completionLikelihood ?? 0.5

  const likeGroup = el("div", "pf-mood-field")
  const likeLabel = el("div", "pf-mood-label")

  likeLabel.textContent = "Will I finish this?"

  likeGroup.appendChild(likeLabel)

  const likeSliderWrap = el("div", "pf-slider-wrap")

  const likeSlider = el("input", "pf-slider pf-slider-likelihood")

  likeSlider.type = "range"
  likeSlider.min = "0"
  likeSlider.max = "100"
  likeSlider.value = String(Math.round(likelihood * 100))

  const likeDisplay = el("span", "pf-slider-val")
  const likeText = el("span", "pf-slider-emoji")

  const likeEmoji = (n: number): string => {
    if (n < 25) return "😶"
    if (n < 50) return "🤔"
    if (n < 75) return "👀"

    return "🔥"
  }

  const updateLikeSlider = () => {
    const pct = Number(likeSlider.value)

    likelihood = pct / 100

    likeDisplay.textContent = `${pct}%`
    likeText.textContent = likeEmoji(pct)

    likeSlider.style.setProperty("--fill", `${pct}%`)
  }

  updateLikeSlider()

  likeSlider.addEventListener("input", updateLikeSlider)

  likeSliderWrap.appendChild(likeText)
  likeSliderWrap.appendChild(likeSlider)
  likeSliderWrap.appendChild(likeDisplay)

  likeGroup.appendChild(likeSliderWrap)

  root.appendChild(likeGroup)

  /* ────────────────────────────────────────────────────────
     Mood Chips
  ───────────────────────────────────────────────────────── */

  let activeMood: MoodType | null = prefill.activeMood ?? null

  const moodGroup = el("div", "pf-mood-field")
  const moodLabel = el("div", "pf-mood-label")

  moodLabel.textContent = "Vibe right now"

  moodGroup.appendChild(moodLabel)

  const moodRow = el("div", "pf-mood-chips")

  const chipEls = new Map<MoodType, HTMLButtonElement>()

  const paintChips = (selected: MoodType | null) => {
    chipEls.forEach((chip, mood) => {
      chip.classList.toggle("pf-mood-chip-on", mood === selected)
    })
  }

  for (const [mood, meta] of Object.entries(MOOD_META) as Array<
    [MoodType, { emoji: string; label: string }]
  >) {
    const chip = el("button", "pf-mood-chip")

    chip.type = "button"

    chip.innerHTML = `
      <span>${meta.emoji}</span>
      <span>${meta.label}</span>
    `

    chip.addEventListener("click", () => {
      activeMood = activeMood === mood ? null : mood

      paintChips(activeMood)
    })

    chipEls.set(mood, chip)

    moodRow.appendChild(chip)
  }

  paintChips(activeMood)

  moodGroup.appendChild(moodRow)

  root.appendChild(moodGroup)

  /* ────────────────────────────────────────────────────────
     Featured Quote
  ───────────────────────────────────────────────────────── */

  const quoteGroup = el("div", "pf-mood-field")

  const quoteLabel = el("div", "pf-mood-label")

  quoteLabel.textContent = "A line that got you"

  quoteGroup.appendChild(quoteLabel)

  const quoteInput = el("textarea", "pf-quote-input")

  quoteInput.value = prefill.featuredQuote ?? ""

  quoteInput.placeholder = "“Even heaven is not enough…”"

  quoteInput.rows = 2

  quoteGroup.appendChild(quoteInput)

  root.appendChild(quoteGroup)

  /* ────────────────────────────────────────────────────────
     Emotion Label
  ───────────────────────────────────────────────────────── */

  const emotionGroup = el("div", "pf-mood-field")

  const emotionLabel = el("div", "pf-mood-label")

  emotionLabel.textContent = "One word for the feeling"

  emotionGroup.appendChild(emotionLabel)

  const emotionInput = el("input", "p-input pf-emotion-input")

  emotionInput.value = prefill.emotionLabel ?? ""

  emotionInput.placeholder = "bittersweet · aching · electric"

  emotionGroup.appendChild(emotionInput)

  root.appendChild(emotionGroup)

  /* ────────────────────────────────────────────────────────
     Public Refs
  ───────────────────────────────────────────────────────── */

  return {
    root,

    refs: {
      getRating: () => currentRating,

      getLikelihood: () => likelihood,

      getMood: () => activeMood,

      getQuote: () => quoteInput.value.trim(),

      getEmotionLabel: () => emotionInput.value.trim(),

      getOverallProgress: () => overallProg,
    },
  }
}
