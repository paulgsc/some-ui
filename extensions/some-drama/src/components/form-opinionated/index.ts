/**
 *
 * Builds the opinionated / ephemeral section of the entry form ("Feels" tab).
 *
 * ADR-002: emotion is captured as a *vector*, not a flat label. The old mood
 * chip grid and "one word" emotion-label input are gone; in their place are
 * four bipolar tension axes, a before→after transition, key-moment tags with a
 * peak line, and an emotional-momentum control. Star rating, series progress,
 * likelihood, and the featured-quote textarea are kept.
 *
 * ── Panel shell contract ────────────────────────────────────────────────────
 * Same pattern as form-structural: root is a bare <div>, renderer assigns
 * `.pf-panel` / `.pf-panel-visible`. Inner `.pf-mood` carries the layout.
 *
 * ── Separation of concerns ──────────────────────────────────────────────────
 * This module builds DOM and returns getter refs only. It does not persist,
 * message, or import from background.ts. The renderer reads the refs on save.
 */

import type { DramaEntry, MomentTag } from "@drama/types"

type El = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string
) => HTMLElementTagNameMap[K]

// ── Axis config ────────────────────────────────────────────────────────────
type AxisKey = "connection" | "hope" | "trust" | "control"

const AXES: ReadonlyArray<{ key: AxisKey; left: string; right: string }> = [
  { key: "connection", left: "Connection", right: "Separation" },
  { key: "hope", left: "Hope", right: "Despair" },
  { key: "trust", left: "Trust", right: "Betrayal" },
  { key: "control", left: "Control", right: "Helplessness" },
] as const

// ── Tag config ─────────────────────────────────────────────────────────────
// Glyphs are placeholders — purely cosmetic, swap freely. They carry no logic.
const TAG_META: ReadonlyArray<{ tag: MomentTag; icon: string; label: string }> =
  [
    { tag: "confession", icon: "💬", label: "confession" },
    { tag: "handTouch", icon: "🤝", label: "hand touch" },
    { tag: "jealousy", icon: "👁", label: "jealousy" },
    { tag: "misunderstanding", icon: "🗯", label: "misunderstanding" },
    { tag: "reveal", icon: "🔍", label: "reveal" },
    { tag: "argument", icon: "💥", label: "argument" },
    { tag: "reunion", icon: "🤗", label: "reunion" },
    { tag: "goodbye", icon: "👋", label: "goodbye" },
    { tag: "kiss", icon: "💋", label: "kiss" },
    { tag: "promise", icon: "🤞", label: "promise" },
    { tag: "sacrifice", icon: "🕯", label: "sacrifice" },
    { tag: "other", icon: "⋯", label: "other" },
  ] as const

const PEAK_MAX = 80
const WHY_MAX = 80

type Direction = "rising" | "steady" | "falling"

const DIRECTIONS: ReadonlyArray<{ dir: Direction; label: string }> = [
  { dir: "rising", label: "Rising ↑" },
  { dir: "steady", label: "Steady —" },
  { dir: "falling", label: "Falling ↓" },
] as const

export type OpinionatedFieldRefs = {
  getRating: () => number
  getLikelihood: () => number
  getQuote: () => string
  getOverallProgress: () => number
  getAxes: () => {
    connection: number
    hope: number
    trust: number
    control: number
  }
  getTransition: () => { before: string; after: string }
  getTags: () => Array<MomentTag>
  getPeakLine: () => string
  getMomentum: () => { value: number; direction: Direction }
}

// Format an axis value with an explicit sign: +70, -30, 0.
const fmtAxis = (v: number): string => (v > 0 ? `+${v}` : String(v))

// Map a -100..+100 axis value to a 0..100% track fill.
const axisFillPct = (v: number): number => ((v + 100) / 200) * 100

export function buildOpinionatedSection(
  el: El,
  prefill: Partial<DramaEntry>
): { root: HTMLElement; refs: OpinionatedFieldRefs } {
  // Panel shell — visibility only
  const root = el("div")

  // Inner layout container
  const inner = el("div", "pf-mood")
  root.appendChild(inner)

  // ── Section header ──────────────────────────────────────────────────────────
  const header = el("div", "pf-mood-header")
  header.innerHTML = `<span class="pf-mood-header-shimmer">✦ this moment</span>`
  inner.appendChild(header)

  // ── Star rating (kept) ──────────────────────────────────────────────────────
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

  // ════════════════════════════════════════════════════════════════════════════
  // Section A — Emotional Tension Axes
  // ════════════════════════════════════════════════════════════════════════════
  const axisState: Record<AxisKey, number> = {
    connection: prefill.axes?.connection ?? 0,
    hope: prefill.axes?.hope ?? 0,
    trust: prefill.axes?.trust ?? 0,
    control: prefill.axes?.control ?? 0,
  }

  const axesSection = el("div", "pf-mood-field pf-axes")
  const axesTitle = el("div", "pf-section-title")
  axesTitle.textContent = "Emotional tension"
  axesSection.appendChild(axesTitle)

  for (const axis of AXES) {
    const row = el("div", "pf-axis")
    const initial = axisState[axis.key]

    const poleL = el("span", "pf-axis-pole pf-axis-pole-left")
    poleL.textContent = axis.left
    const poleR = el("span", "pf-axis-pole pf-axis-pole-right")
    poleR.textContent = axis.right

    const slider = el("input", "pf-slider pf-axis-slider")
    slider.type = "range"
    slider.min = "-100"
    slider.max = "100"
    slider.value = String(initial)

    const valBadge = el("span", "pf-axis-val")
    valBadge.textContent = fmtAxis(initial)

    const paintAxis = (v: number): void => {
      slider.style.setProperty("--fill", `${axisFillPct(v)}%`)
      row.classList.toggle("pf-axis-pos", v > 0)
      row.classList.toggle("pf-axis-neg", v < 0)
      valBadge.textContent = fmtAxis(v)
    }

    slider.addEventListener("input", () => {
      const v = Number(slider.value)
      axisState[axis.key] = v
      paintAxis(v)
    })
    paintAxis(initial)

    row.appendChild(poleL)
    row.appendChild(slider)
    row.appendChild(poleR)
    row.appendChild(valBadge)
    axesSection.appendChild(row)
  }

  // Gradient legend bar with scale ticks
  const legend = el("div", "pf-axis-legend")
  const legendBar = el("div", "pf-axis-legend-bar")
  legend.appendChild(legendBar)
  const legendScale = el("div", "pf-axis-legend-scale")
  for (const tick of ["-100", "-50", "0", "+50", "+100"]) {
    const t = el("span", "pf-axis-legend-tick")
    t.textContent = tick
    legendScale.appendChild(t)
  }
  legend.appendChild(legendScale)
  axesSection.appendChild(legend)
  inner.appendChild(axesSection)

  // ════════════════════════════════════════════════════════════════════════════
  // Section B — Before → After
  // ════════════════════════════════════════════════════════════════════════════
  const transitionSection = el("div", "pf-mood-field pf-transition")
  const transTitle = el("div", "pf-section-title")
  transTitle.textContent = "Before → after"
  transitionSection.appendChild(transTitle)

  const transRow = el("div", "pf-transition-row")
  const beforeInput = el("input", "p-input pf-transition-input")
  beforeInput.value = prefill.transition?.before ?? ""
  beforeInput.placeholder = "before…"
  const transArrow = el("span", "pf-transition-arrow")
  transArrow.textContent = "→"
  const afterInput = el("input", "p-input pf-transition-input")
  afterInput.value = prefill.transition?.after ?? ""
  afterInput.placeholder = "after…"

  transRow.appendChild(beforeInput)
  transRow.appendChild(transArrow)
  transRow.appendChild(afterInput)
  transitionSection.appendChild(transRow)
  inner.appendChild(transitionSection)

  // ════════════════════════════════════════════════════════════════════════════
  // Section C — Key Moment Tags
  // ════════════════════════════════════════════════════════════════════════════
  const selectedTags = new Set<MomentTag>(prefill.tags ?? [])

  const tagsSection = el("div", "pf-mood-field pf-tags-section")
  const tagsTitle = el("div", "pf-section-title")
  tagsTitle.textContent = "Key moments"
  tagsSection.appendChild(tagsTitle)

  const tagGrid = el("div", "pf-tags")
  for (const meta of TAG_META) {
    const chip = el("button", "pf-tag-chip")
    if (selectedTags.has(meta.tag)) chip.classList.add("pf-tag-chip-on")

    const icon = el("span", "pf-tag-icon")
    icon.textContent = meta.icon
    const label = el("span", "pf-tag-label")
    label.textContent = meta.label
    chip.appendChild(icon)
    chip.appendChild(label)

    chip.addEventListener("click", () => {
      if (selectedTags.has(meta.tag)) selectedTags.delete(meta.tag)
      else selectedTags.add(meta.tag)
      chip.classList.toggle("pf-tag-chip-on", selectedTags.has(meta.tag))
    })
    tagGrid.appendChild(chip)
  }
  tagsSection.appendChild(tagGrid)

  // Peak moment line + char count
  const peakWrap = el("div", "pf-peakline-wrap")
  const peakInput = el("input", "p-input pf-peakline-input")
  peakInput.value = (prefill.peakLine ?? "").slice(0, PEAK_MAX)
  peakInput.placeholder = "Peak moment line (optional)"
  peakInput.maxLength = PEAK_MAX
  const peakCount = el("span", "pf-peakline-count")
  peakCount.textContent = `${peakInput.value.length}/${PEAK_MAX}`
  peakInput.addEventListener("input", () => {
    peakCount.textContent = `${peakInput.value.length}/${PEAK_MAX}`
  })
  peakWrap.appendChild(peakInput)
  peakWrap.appendChild(peakCount)
  tagsSection.appendChild(peakWrap)
  inner.appendChild(tagsSection)

  // ════════════════════════════════════════════════════════════════════════════
  // Section D — Emotional Momentum
  // ════════════════════════════════════════════════════════════════════════════
  let momentumValue = prefill.momentum?.value ?? 50
  let momentumDir: Direction = prefill.momentum?.direction ?? "steady"

  const momentumSection = el("div", "pf-mood-field pf-momentum")
  const momTitle = el("div", "pf-section-title")
  momTitle.textContent = "Momentum"
  momentumSection.appendChild(momTitle)

  // Tension slider 0–100
  const tensionLabel = el("div", "pf-mood-label")
  tensionLabel.textContent = "Tension"
  momentumSection.appendChild(tensionLabel)

  const momWrap = el("div", "pf-slider-wrap")
  const momSlider = el("input", "pf-slider pf-momentum-slider")
  momSlider.type = "range"
  momSlider.min = "0"
  momSlider.max = "100"
  momSlider.value = String(Math.round(momentumValue))
  const momDisplay = el("span", "pf-slider-val")
  momDisplay.textContent = String(Math.round(momentumValue))

  const syncMomentum = (): void => {
    const v = Number(momSlider.value)
    momentumValue = v
    momDisplay.textContent = String(v)
    momSlider.style.setProperty("--fill", `${v}%`)
  }
  momSlider.style.setProperty("--fill", `${Math.round(momentumValue)}%`)
  momSlider.addEventListener("input", syncMomentum)
  momWrap.appendChild(momSlider)
  momWrap.appendChild(momDisplay)
  momentumSection.appendChild(momWrap)

  // Direction toggle (radio behaviour)
  const dirRow = el("div", "pf-momentum-dir")
  const dirBtns = new Map<Direction, HTMLButtonElement>()
  const paintDir = (active: Direction): void => {
    dirBtns.forEach((btn, dir) =>
      btn.classList.toggle("pf-momentum-dir-on", dir === active)
    )
  }
  for (const { dir, label } of DIRECTIONS) {
    const btn = el("button", "pf-momentum-dir-btn")
    btn.textContent = label
    btn.addEventListener("click", () => {
      momentumDir = dir
      paintDir(dir)
    })
    dirBtns.set(dir, btn)
    dirRow.appendChild(btn)
  }
  paintDir(momentumDir)
  momentumSection.appendChild(dirRow)

  // "Why?" textarea + char count
  const whyWrap = el("div", "pf-momentum-why-wrap")
  const whyInput = el("textarea", "pf-momentum-why")
  whyInput.value = "" // no storage backing — see open note below
  whyInput.placeholder = "Why?"
  whyInput.rows = 2
  whyInput.maxLength = WHY_MAX
  const whyCount = el("span", "pf-momentum-why-count")
  whyCount.textContent = `${whyInput.value.length}/${WHY_MAX}`
  whyInput.addEventListener("input", () => {
    whyCount.textContent = `${whyInput.value.length}/${WHY_MAX}`
  })
  whyWrap.appendChild(whyInput)
  whyWrap.appendChild(whyCount)
  momentumSection.appendChild(whyWrap)
  inner.appendChild(momentumSection)

  // ── Overall progress slider (kept) ──────────────────────────────────────────
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

  // ── Completion likelihood slider (kept) ─────────────────────────────────────
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

  // ── Featured quote (kept → featuredQuote) ───────────────────────────────────
  const quoteGroup = el("div", "pf-mood-field")
  const quoteLabel = el("div", "pf-mood-label")
  quoteLabel.textContent = "A line that got you"
  quoteGroup.appendChild(quoteLabel)
  const quoteInput = el("textarea", "pf-quote-input")
  quoteInput.value = prefill.featuredQuote ?? ""
  quoteInput.placeholder = "\u201cEven heaven is not enough\u2026\u201d"
  quoteInput.rows = 2
  quoteGroup.appendChild(quoteInput)
  inner.appendChild(quoteGroup)

  return {
    root,
    refs: {
      getRating: () => currentRating,
      getLikelihood: () => likelihood,
      getQuote: () => quoteInput.value.trim(),
      getOverallProgress: () => overallProg,
      getAxes: () => ({ ...axisState }),
      getTransition: () => ({
        before: beforeInput.value.trim(),
        after: afterInput.value.trim(),
      }),
      getTags: () => Array.from(selectedTags),
      getPeakLine: () => peakInput.value.trim(),
      getMomentum: () => ({
        value: Math.round(momentumValue),
        direction: momentumDir,
      }),
    },
  }
}
