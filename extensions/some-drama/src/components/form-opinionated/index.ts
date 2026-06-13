/**
 *
 * Builds the opinionated / ephemeral section of the entry form.
 * Captures how you feel right now: rating, likelihood, mood, quote, emotion label,
 * overall progress.
 *
 * ── Panel shell contract ────────────────────────────────────────────────────
 * Same pattern as form-structural: root is a bare <div>, renderer assigns
 * `.pf-panel` / `.pf-panel-visible`. Inner `.pf-mood` carries the layout.
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
  // Panel shell — visibility only
  const root = el("div")

  // Inner layout container
  const inner = el("div", "pf-mood")
  root.appendChild(inner)

  // ── Section header ────────────────────────────────────────────────────────
  const header = el("div", "pf-mood-header")
  header.innerHTML = `<span class="pf-mood-header-shimmer">✦ this moment</span>`
  inner.appendChild(header)

  // ── Star rating ───────────────────────────────────────────────────────────
  let currentRating = Math.round(prefill.rating ?? 0)
  const ratingGroup = el("div", "pf-mood-field")
  const ratingLabel = el("div", "pf-mood-label")
  ratingLabel.textContent = "Rating"
  ratingGroup.appendChild(ratingLabel)

  const stars = el("div", "pf-stars")
  const starEls: Array<HTMLButtonElement> = []

  const paintStars = (n: number): void => {
    starEls.forEach((s, i) => s.classList.toggle("pf-star-on", i < n))
  }

  const ratingValue = el("div", "pf-stars-val")
  ratingValue.textContent = currentRating > 0 ? `${currentRating} / 10` : "—"

  for (let i = 1; i <= 10; i++) {
    const s = el("button", "pf-star")
    s.textContent = "★"
    s.addEventListener("click", () => {
      currentRating = i
      paintStars(i)
      ratingValue.textContent = `${currentRating} / 10`
    })
    s.addEventListener("mouseenter", () => paintStars(i))
    s.addEventListener("mouseleave", () => paintStars(currentRating))
    starEls.push(s)
    stars.appendChild(s)
  }
  paintStars(currentRating)
  ratingGroup.appendChild(stars)
  ratingGroup.appendChild(ratingValue)
  inner.appendChild(ratingGroup)

  // ── Overall progress slider ───────────────────────────────────────────────
  let overallProg = prefill.overallProgress ?? 0
  const progGroup = el("div", "pf-mood-field")
  const progLabel = el("div", "pf-mood-label")
  progLabel.textContent = "Series Progress"
  progGroup.appendChild(progLabel)

  const progWrap = el("div", "pf-slider-wrap")
  const progSlider = el("input", "pf-slider")
  progSlider.type = "range"
  progSlider.min = "0"
  progSlider.max = "100"
  progSlider.value = String(Math.round(overallProg * 100))

  const progDisplay = el("span", "pf-slider-val")
  progDisplay.textContent = `${Math.round(overallProg * 100)}%`

  const syncProg = (): void => {
    const pct = Number(progSlider.value)
    overallProg = pct / 100
    progDisplay.textContent = `${pct}%`
    progSlider.style.setProperty("--fill", `${pct}%`)
  }
  progSlider.style.setProperty("--fill", `${Math.round(overallProg * 100)}%`)
  progSlider.addEventListener("input", syncProg)
  progWrap.appendChild(progSlider)
  progWrap.appendChild(progDisplay)
  progGroup.appendChild(progWrap)
  inner.appendChild(progGroup)

  // ── Completion likelihood slider ──────────────────────────────────────────
  let likelihood = prefill.completionLikelihood ?? 0.5
  const likeGroup = el("div", "pf-mood-field")
  const likeLabel = el("div", "pf-mood-label")
  likeLabel.textContent = "Will I finish this?"
  likeGroup.appendChild(likeLabel)

  const likeWrap = el("div", "pf-slider-wrap")
  const likeSlider = el("input", "pf-slider pf-slider-likelihood")
  likeSlider.type = "range"
  likeSlider.min = "0"
  likeSlider.max = "100"
  likeSlider.value = String(Math.round(likelihood * 100))

  const likeEmoji = (n: number): string =>
    n < 25 ? "😶" : n < 50 ? "🤔" : n < 75 ? "👀" : "🔥"
  const likeEmojiEl = el("span", "pf-slider-emoji")
  likeEmojiEl.textContent = likeEmoji(Math.round(likelihood * 100))
  const likeDisplay = el("span", "pf-slider-val")
  likeDisplay.textContent = `${Math.round(likelihood * 100)}%`

  const syncLike = (): void => {
    const pct = Number(likeSlider.value)
    likelihood = pct / 100
    likeDisplay.textContent = `${pct}%`
    likeSlider.style.setProperty("--fill", `${pct}%`)
    likeEmojiEl.textContent = likeEmoji(pct)
  }
  likeSlider.style.setProperty("--fill", `${Math.round(likelihood * 100)}%`)
  likeSlider.addEventListener("input", syncLike)
  likeWrap.appendChild(likeEmojiEl)
  likeWrap.appendChild(likeSlider)
  likeWrap.appendChild(likeDisplay)
  likeGroup.appendChild(likeWrap)
  inner.appendChild(likeGroup)

  // ── Mood chips ────────────────────────────────────────────────────────────
  let activeMood: MoodType | null = prefill.activeMood ?? null
  const moodGroup = el("div", "pf-mood-field")
  const moodLabel = el("div", "pf-mood-label")
  moodLabel.textContent = "Vibe right now"
  moodGroup.appendChild(moodLabel)

  const moodRow = el("div", "pf-mood-chips")
  const chipEls = new Map<MoodType, HTMLButtonElement>()

  const paintChips = (selected: MoodType | null): void => {
    chipEls.forEach((chip, mood) =>
      chip.classList.toggle("pf-mood-chip-on", mood === selected)
    )
  }

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  for (const [mood, meta] of Object.entries(MOOD_META) as Array<
    [MoodType, { emoji: string; label: string }]
  >) {
    const chip = el("button", "pf-mood-chip")
    chip.innerHTML = `<span>${meta.emoji}</span><span>${meta.label}</span>`
    chip.addEventListener("click", () => {
      activeMood = activeMood === mood ? null : mood
      paintChips(activeMood)
    })
    chipEls.set(mood, chip)
    moodRow.appendChild(chip)
  }
  paintChips(activeMood)
  moodGroup.appendChild(moodRow)
  inner.appendChild(moodGroup)

  // ── Featured quote ────────────────────────────────────────────────────────
  const quoteGroup = el("div", "pf-mood-field")
  const quoteLabel = el("div", "pf-mood-label")
  quoteLabel.textContent = "A line that got you"
  quoteGroup.appendChild(quoteLabel)
  const quoteInput = document.createElement("textarea")
  quoteInput.className = "pf-quote-input"
  quoteInput.value = prefill.featuredQuote ?? ""
  quoteInput.placeholder = "\u201cEven heaven is not enough\u2026\u201d"
  quoteInput.rows = 2
  quoteGroup.appendChild(quoteInput)
  inner.appendChild(quoteGroup)

  // ── Emotion label ─────────────────────────────────────────────────────────
  const emotionGroup = el("div", "pf-mood-field")
  const emotionLabel = el("div", "pf-mood-label")
  emotionLabel.textContent = "One word for the feeling"
  emotionGroup.appendChild(emotionLabel)
  const emotionInput = el("input", "p-input pf-emotion-input")
  emotionInput.value = prefill.emotionLabel ?? ""
  emotionInput.placeholder = "bittersweet · aching · electric"
  emotionGroup.appendChild(emotionInput)
  inner.appendChild(emotionGroup)

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
