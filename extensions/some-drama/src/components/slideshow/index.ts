// ── Slideshow ─────────────────────────────────────────────────────────────────
// Owns: circle ring DOM, three slides, slide nav dots, chat bubble.
// Does NOT know about card size, drag, or right-panel state.
// Parent calls: setSlide(), applyPosterState(), applyRatingState(),
//               applyEmotionState(), setBubbleVisible(), setBubbleQuote().

import {
  FALLBACK_QUOTES,
  MOODS,
  SLIDE_INTERVAL_MS,
} from "@drama/lib/content/constants"
import { el, starsFor } from "@drama/lib/content/utils"
import type { CardState, MoodType } from "@drama/types"

export class Slideshow {
  /** Root element — append to .dc-circle-wrap */
  readonly wrap: HTMLDivElement

  private ring: HTMLDivElement
  private slidePoster: HTMLDivElement
  private slideRating: HTMLDivElement
  private slideEmotion: HTMLDivElement
  private slides: Array<HTMLDivElement>
  private dots: Array<HTMLSpanElement>

  // Slide internals
  private ratingValue: HTMLSpanElement
  private ratingStars: HTMLSpanElement
  private emotionBackdrop: HTMLDivElement
  private emotionEmoji: HTMLSpanElement
  private emotionLabel: HTMLSpanElement

  // Chat bubble
  private bubble: HTMLDivElement
  private bubbleQuote: HTMLSpanElement

  private currentSlide = 0
  private timer: ReturnType<typeof setInterval> | null = null

  /** Called when user clicks circle to advance slide manually */
  onSlideClick?: () => void

  constructor() {
    this.wrap = el("div", "dc-circle-wrap")

    // Decorative spinning ring
    this.ring = el("div", "dc-circle-ring")

    // Clipped slideshow surface
    const slideshow = el("div", "dc-slideshow")
    const inner = el("div", "dc-slideshow-inner")

    this.slidePoster = this.buildPosterSlide()
    this.slideRating = this.buildRatingSlide()
    this.slideEmotion = this.buildEmotionSlide()

    this.slides = [this.slidePoster, this.slideRating, this.slideEmotion]
    this.slides.forEach((s) => inner.appendChild(s))

    // Nav dots
    const dotsWrap = el("div", "dc-slide-dots")
    this.dots = Array.from({ length: 3 }, () => {
      const d = el("span", "dc-slide-dot")
      dotsWrap.appendChild(d)
      return d
    })

    slideshow.appendChild(inner)
    slideshow.appendChild(dotsWrap)

    // Chat bubble — child of wrap, absolutely positioned below circle
    this.bubble = el("div", "dc-chat-bubble")
    this.bubbleQuote = el("span", "dc-bubble-quote")
    this.bubble.appendChild(this.bubbleQuote)
    this.bubble.style.display = "none"

    this.wrap.appendChild(this.ring)
    this.wrap.appendChild(slideshow)
    this.wrap.appendChild(this.bubble)

    // Click circle to advance
    this.wrap.addEventListener("click", () => this.onSlideClick())
  }

  // ── Public interface ────────────────────────────────────────────────────────

  setSlide(idx: number): void {
    this.slides.forEach((s, i) =>
      s.classList.toggle("dc-slide-active", i === idx)
    )
    this.dots.forEach((d, i) => d.classList.toggle("dc-dot-active", i === idx))
    this.currentSlide = idx
  }

  get current(): number {
    return this.currentSlide
  }

  startAutoAdvance(intervalMs = SLIDE_INTERVAL_MS): void {
    this.stopAutoAdvance()
    this.timer = setInterval(() => {
      this.setSlide((this.currentSlide + 1) % this.slides.length)
    }, intervalMs)
  }

  stopAutoAdvance(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  setBubbleVisible(visible: boolean): void {
    this.bubble.style.display = visible ? "" : "none"
  }

  setBubbleQuote(quote: string): void {
    this.bubbleQuote.textContent = `"${quote}"`
  }

  applyPosterState(
    state: Pick<CardState, "posterUrl" | "dramaTitle" | "featuredQuote">
  ): void {
    // Rebuild poster slide content
    this.slidePoster.innerHTML = ""

    if (state.posterUrl) {
      const img = el("img")
      img.src = state.posterUrl
      img.alt = state.dramaTitle
      this.slidePoster.appendChild(img)
    } else {
      const ph = el("div", "dc-slide-poster-placeholder")
      ph.textContent = "🎬"
      this.slidePoster.appendChild(ph)
    }

    // Re-attach bubble after innerHTML wipe
    this.wrap.appendChild(this.bubble)

    // Update quote
    const q =
      state.featuredQuote ||
      FALLBACK_QUOTES[
        Math.floor(Date.now() / SLIDE_INTERVAL_MS) % FALLBACK_QUOTES.length
      ]
    this.setBubbleQuote(q)
  }

  applyRatingState(rating: number): void {
    this.ratingValue.textContent = rating.toFixed(1)
    this.ratingStars.textContent = starsFor(rating)
  }

  applyEmotionState(activeMood: MoodType | null, emotionLabel: string): void {
    const mood = MOODS.find((m) => m.type === activeMood)
    this.emotionEmoji.textContent = mood ? mood.emoji : "✨"
    this.emotionLabel.textContent = emotionLabel || mood?.label || "…"
  }

  destroy(): void {
    this.stopAutoAdvance()
  }

  // ── DOM builders ────────────────────────────────────────────────────────────

  private buildPosterSlide(): HTMLDivElement {
    // Content filled by applyPosterState()
    return el("div", "dc-slide dc-slide-poster")
  }

  private buildRatingSlide(): HTMLDivElement {
    const slide = el("div", "dc-slide dc-slide-rating")
    this.ratingValue = el("span", "dc-rating-value")
    this.ratingStars = el("span", "dc-rating-stars")
    const label = el("span", "dc-rating-label")
    label.textContent = "my rating"
    slide.appendChild(this.ratingValue)
    slide.appendChild(this.ratingStars)
    slide.appendChild(label)
    return slide
  }

  private buildEmotionSlide(): HTMLDivElement {
    const slide = el("div", "dc-slide dc-slide-emotion")
    this.emotionBackdrop = el("div", "dc-emotion-backdrop")
    this.emotionEmoji = el("span", "dc-emotion-emoji")
    this.emotionLabel = el("span", "dc-slide-label")
    slide.appendChild(this.emotionBackdrop)
    slide.appendChild(this.emotionEmoji)
    slide.appendChild(this.emotionLabel)
    return slide
  }
}
