// ── Slideshow ─────────────────────────────────────────────────────────────────
// Owns: circle ring DOM, eight slides, slide nav dots, chat bubble.
// Does NOT know about card size, drag, or right-panel state.
//
// Slide order (ADR-002):
//   0 axes · 1 transition · 2 poster · 3 tags · 4 momentum ·
//   5 atmosphere · 6 rating · 7 summary
//
// Parent calls: setSlide(), applyAxesState(), applyTransitionState(),
//   applyPosterState(), applyTagsState(), applyMomentumState(),
//   applyAtmosphereState(), applyRatingState(), applySummaryState(),
//   setBubbleVisible(), setBubbleQuote().

import {
  FALLBACK_QUOTES,
  SLIDE_INTERVAL_MS,
} from "@drama/lib/content/constants"
import { el, starsFor } from "@drama/lib/content/utils"
import type { CardState, MomentTag } from "@drama/types"

// Display glyphs for tags — cosmetic only, mirrors form-opinionated's TAG_META.
const TAG_GLYPH: Record<MomentTag, string> = {
  confession: "💬",
  handTouch: "🤝",
  jealousy: "👁",
  misunderstanding: "🗯",
  reveal: "🔍",
  argument: "💥",
  reunion: "🤗",
  goodbye: "👋",
  kiss: "💋",
  promise: "🤞",
  sacrifice: "🕯",
  betrayal: "🗡",
  separation: "💔",
  rivalry: "⚔",
  other: "⋯",
}

type AxisKey = keyof CardState["axes"]

const POLE: Record<AxisKey, { pos: string; neg: string }> = {
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

const DIR_GLYPH: Record<CardState["momentum"]["direction"], string> = {
  rising: "↑",
  steady: "—",
  falling: "↓",
}

const fmtAxis = (v: number): string => (v > 0 ? `+${v}` : String(v))
const axisFillPct = (v: number): number => ((v + 100) / 200) * 100

export class Slideshow {
  /** Root element — append to .dc-circle-wrap */
  readonly wrap: HTMLDivElement

  /** Index of the poster slide — used by DramaCard for bubble visibility. */
  readonly posterSlideIndex = 2

  private ring: HTMLDivElement
  private slides: Array<HTMLDivElement>
  private dots: Array<HTMLSpanElement>

  // Slide 0 — axes
  private axisBars!: Array<{
    key: AxisKey
    fill: HTMLDivElement
    val: HTMLSpanElement
    row: HTMLDivElement
  }>
  // Slide 1 — transition
  private transBefore!: HTMLSpanElement
  private transAfter!: HTMLSpanElement
  private transPrompt!: HTMLSpanElement
  private transPair!: HTMLDivElement
  // Slide 2 — poster
  private slidePoster!: HTMLDivElement
  // Slide 3 — tags
  private tagsChips!: HTMLDivElement
  private tagsPeak!: HTMLDivElement
  // Slide 4 — momentum
  private momValue!: HTMLSpanElement
  private momDir!: HTMLSpanElement
  private momArc!: SVGElement
  // Slide 5 — atmosphere
  private atmoLayer!: HTMLDivElement
  // Slide 6 — rating
  private ratingValue!: HTMLSpanElement
  private ratingStars!: HTMLSpanElement
  private ratingMomentum!: HTMLSpanElement
  // Slide 7 — summary
  private summaryBody!: HTMLDivElement

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

    this.slides = [
      this.buildAxesSlide(), // 0
      this.buildTransitionSlide(), // 1
      this.buildPosterSlide(), // 2
      this.buildTagsSlide(), // 3
      this.buildMomentumSlide(), // 4
      this.buildAtmosphereSlide(), // 5
      this.buildRatingSlide(), // 6
      this.buildSummarySlide(), // 7
    ]
    this.slides.forEach((s) => inner.appendChild(s))

    // Nav dots — one per slide
    const dotsWrap = el("div", "dc-slide-dots")
    this.dots = this.slides.map(() => {
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
    this.wrap.addEventListener("click", () => this.onSlideClick?.())
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

  /** Total slide count — lets DramaCard advance without a hardcoded modulo. */
  get slideCount(): number {
    return this.slides.length
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

  // ── Slide 0: axes ─────────────────────────────────────────────────────────
  applyAxesState(axes: CardState["axes"]): void {
    for (const bar of this.axisBars) {
      const v = axes[bar.key]
      bar.fill.style.setProperty("--fill", `${axisFillPct(v)}%`)
      bar.row.classList.toggle("dc-axis-pos", v > 0)
      bar.row.classList.toggle("dc-axis-neg", v < 0)
      bar.val.textContent = fmtAxis(v)
    }
  }

  // ── Slide 1: transition ───────────────────────────────────────────────────
  applyTransitionState(transition: CardState["transition"]): void {
    const before = transition.before.trim()
    const after = transition.after.trim()
    const empty = !before && !after
    this.transPrompt.style.display = empty ? "" : "none"
    this.transPair.style.display = empty ? "none" : ""
    this.transBefore.textContent = before || "…"
    this.transAfter.textContent = after || "…"
  }

  // ── Slide 2: poster (unchanged behaviour) ─────────────────────────────────
  applyPosterState(
    state: Pick<CardState, "posterUrl" | "dramaTitle" | "featuredQuote">
  ): void {
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

    const quoteIndex =
      Math.floor(Date.now() / SLIDE_INTERVAL_MS) % FALLBACK_QUOTES.length
    const q = state.featuredQuote || FALLBACK_QUOTES[quoteIndex] || ""

    this.setBubbleQuote(q)
  }

  // ── Slide 3: tags ─────────────────────────────────────────────────────────
  applyTagsState(tags: Array<MomentTag>, peakLine: string): void {
    this.tagsChips.innerHTML = ""
    const MAX_VISIBLE = 4
    const visible = tags.slice(0, MAX_VISIBLE)
    for (const tag of visible) {
      const chip = el("span", "dc-tag-chip")
      chip.textContent = TAG_GLYPH[tag]
      chip.title = tag
      this.tagsChips.appendChild(chip)
    }
    const overflow = tags.length - visible.length
    if (overflow > 0) {
      const more = el("span", "dc-tag-chip dc-tag-more")
      more.textContent = `+${overflow}`
      this.tagsChips.appendChild(more)
    }

    const line = peakLine.trim()
    this.tagsPeak.textContent = line
    this.tagsPeak.style.display = line ? "" : "none"
  }

  // ── Slide 4: momentum ─────────────────────────────────────────────────────
  applyMomentumState(momentum: CardState["momentum"]): void {
    this.momValue.textContent = String(Math.round(momentum.value))
    this.momDir.textContent = `${cap(momentum.direction)} ${DIR_GLYPH[momentum.direction]}`
    this.momArc.setAttribute("d", arcPath(momentum.direction))

    this.ratingMomentum.textContent = `momentum ${cap(momentum.direction)} ${DIR_GLYPH[momentum.direction]}`
  }

  // ── Slide 5: atmosphere (derived, display-only) ───────────────────────────
  applyAtmosphereState(axes: CardState["axes"]): void {
    const warmth = (axes.connection + axes.hope + axes.trust + axes.control) / 4 // -100..+100
    const betrayal = axes.trust < 0 ? -axes.trust : 0
    const separation = axes.connection < 0 ? -axes.connection : 0
    const tension = Math.max(betrayal, separation) // 0..100

    // warmth → hue mix between cool token and warm token, expressed 0..1
    const warmMix = (warmth + 100) / 200
    this.atmoLayer.style.setProperty("--dc-atmo-warm", warmMix.toFixed(3))
    // tension → blur 0..6px and a magenta tint strength 0..1
    this.atmoLayer.style.setProperty(
      "--dc-atmo-blur",
      `${((tension / 100) * 6).toFixed(2)}px`
    )
    this.atmoLayer.style.setProperty(
      "--dc-atmo-tension",
      (tension / 100).toFixed(3)
    )
  }

  // ── Slide 6: rating (unchanged value/star behaviour) ──────────────────────
  applyRatingState(rating: number): void {
    this.ratingValue.textContent = rating.toFixed(1)
    this.ratingStars.textContent = starsFor(rating)
  }

  // ── Slide 7: summary (derived, display-only) ──────────────────────────────
  applySummaryState(state: CardState): void {
    this.summaryBody.innerHTML = ""

    // Dominant axis = largest magnitude
    let domKey: AxisKey = "connection"
    let domMag = -1
    for (const key of AXIS_ORDER) {
      const mag = Math.abs(state.axes[key])
      if (mag > domMag) {
        domMag = mag
        domKey = key
      }
    }
    const domVal = state.axes[domKey]
    const domPole = domVal >= 0 ? POLE[domKey].pos : POLE[domKey].neg

    const addLine = (label: string, value: string): void => {
      const row = el("div", "dc-summary-row")
      const l = el("span", "dc-summary-label")
      l.textContent = label
      const v = el("span", "dc-summary-value")
      v.textContent = value
      row.appendChild(l)
      row.appendChild(v)
      this.summaryBody.appendChild(row)
    }

    if (domMag > 0) addLine("axis", `${domPole} ${fmtAxis(domVal)}`)

    const before = state.transition.before.trim()
    const after = state.transition.after.trim()
    if (before || after) addLine("arc", `${before || "…"} → ${after || "…"}`)

    if (state.tags.length > 0) {
      const glyphs = state.tags.slice(0, 4).map((t) => TAG_GLYPH[t])
      const extra = state.tags.length > 4 ? ` +${state.tags.length - 4}` : ""
      addLine("tags", glyphs.join(" ") + extra)
    }

    addLine(
      "momentum",
      `${Math.round(state.momentum.value)} ${cap(state.momentum.direction)} ${DIR_GLYPH[state.momentum.direction]}`
    )

    const peak = state.peakLine.trim()
    if (peak) addLine("peak", peak)
  }

  destroy(): void {
    this.stopAutoAdvance()
  }

  // ── DOM builders ────────────────────────────────────────────────────────────

  private buildAxesSlide(): HTMLDivElement {
    const slide = el("div", "dc-slide dc-slide-axes")
    this.axisBars = AXIS_ORDER.map((key) => {
      const row = el("div", "dc-axis-bar")
      const label = el("span", "dc-axis-bar-label")
      label.textContent = POLE[key].pos.slice(0, 4) // compact at ~80px
      const track = el("div", "dc-axis-bar-track")
      const fill = el("div", "dc-axis-bar-fill")
      track.appendChild(fill)
      const val = el("span", "dc-axis-bar-val")
      val.textContent = "0"
      row.appendChild(label)
      row.appendChild(track)
      row.appendChild(val)
      slide.appendChild(row)
      return { key, fill, val, row }
    })
    return slide
  }

  private buildTransitionSlide(): HTMLDivElement {
    const slide = el("div", "dc-slide dc-slide-transition")
    this.transPair = el("div", "dc-trans-pair")
    this.transBefore = el("span", "dc-trans-before")
    const arrow = el("span", "dc-trans-arrow")
    arrow.textContent = "↓"
    this.transAfter = el("span", "dc-trans-after")
    this.transPair.appendChild(this.transBefore)
    this.transPair.appendChild(arrow)
    this.transPair.appendChild(this.transAfter)

    this.transPrompt = el("span", "dc-trans-prompt")
    this.transPrompt.textContent = "what changed?"
    this.transPrompt.style.display = "none"

    slide.appendChild(this.transPair)
    slide.appendChild(this.transPrompt)
    return slide
  }

  private buildPosterSlide(): HTMLDivElement {
    this.slidePoster = el("div", "dc-slide dc-slide-poster")
    return this.slidePoster
  }

  private buildTagsSlide(): HTMLDivElement {
    const slide = el("div", "dc-slide dc-slide-tags")
    this.tagsChips = el("div", "dc-tags-chips")
    this.tagsPeak = el("div", "dc-tags-peak")
    this.tagsPeak.style.display = "none"
    slide.appendChild(this.tagsChips)
    slide.appendChild(this.tagsPeak)
    return slide
  }

  private buildMomentumSlide(): HTMLDivElement {
    const slide = el("div", "dc-slide dc-slide-momentum")
    this.momValue = el("span", "dc-mom-value")
    this.momValue.textContent = "50"

    const svgNS = "http://www.w3.org/2000/svg"
    const svg = document.createElementNS(svgNS, "svg")
    svg.setAttribute("class", "dc-mom-arc")
    svg.setAttribute("viewBox", "0 0 60 24")
    this.momArc = document.createElementNS(svgNS, "path")
    this.momArc.setAttribute("d", arcPath("steady"))
    this.momArc.setAttribute("fill", "none")
    svg.appendChild(this.momArc)

    this.momDir = el("span", "dc-mom-dir")
    this.momDir.textContent = "Steady —"

    slide.appendChild(this.momValue)
    slide.appendChild(svg)
    slide.appendChild(this.momDir)
    return slide
  }

  private buildAtmosphereSlide(): HTMLDivElement {
    const slide = el("div", "dc-slide dc-slide-atmosphere")
    this.atmoLayer = el("div", "dc-atmo-layer")
    slide.appendChild(this.atmoLayer)
    return slide
  }

  private buildRatingSlide(): HTMLDivElement {
    const slide = el("div", "dc-slide dc-slide-rating")
    this.ratingValue = el("span", "dc-rating-value")
    this.ratingStars = el("span", "dc-rating-stars")
    const label = el("span", "dc-rating-label")
    label.textContent = "my rating"
    this.ratingMomentum = el("span", "dc-rating-momentum")
    slide.appendChild(this.ratingValue)
    slide.appendChild(this.ratingStars)
    slide.appendChild(label)
    slide.appendChild(this.ratingMomentum)
    return slide
  }

  private buildSummarySlide(): HTMLDivElement {
    const slide = el("div", "dc-slide dc-slide-summary")
    this.summaryBody = el("div", "dc-summary-body")
    slide.appendChild(this.summaryBody)
    return slide
  }
}

// ── Local helpers ─────────────────────────────────────────────────────────────

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// Simple sparkline arc in a 60×24 viewBox: rising curves up, falling curves
// down, steady is flat. Quadratic Bézier control point carries the shape.
function arcPath(direction: CardState["momentum"]["direction"]): string {
  switch (direction) {
    case "rising":
      return "M4 20 Q30 2 56 6"
    case "falling":
      return "M4 6 Q30 22 56 20"
    case "steady":
    default:
      return "M4 12 Q30 11 56 12"
  }
}
