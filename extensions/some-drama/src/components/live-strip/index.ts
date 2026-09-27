// ── LiveStrip ─────────────────────────────────────────────────────────────────
// The broadcast surface: what the viewer reads on stream. Owns the beat pulse
// (big emoji, mood label, intensity pips) and the episode curve — the ride so
// far. Knows nothing about storage, messaging or the rest of the card.
// Parent calls: setBeats() when the episode (re)loads, pushBeat() per beat.
//
// The pulse lingers for decayMs(intensity) via a CSS animation restarted on
// each beat, then settles to a resting state that still shows the last mood.
// No JS timers — nothing keeps running between beats.

import { el } from "@drama/effects/content/dom"
import { curvePath, decayMs, episodeCurve } from "@drama/logic/beats"
import { MOODS } from "@drama/logic/content/constants"
import type { BeatRecord } from "@drama/types"

const SVG_NS = "http://www.w3.org/2000/svg" // eslint-disable-line no-restricted-syntax -- XML namespace identifier, not a fetched URL
const CURVE_W = 132
const CURVE_H = 40

export class LiveStrip {
  /** Root element — insert directly above .dc-card in the root column. */
  readonly root: HTMLDivElement

  private emoji: HTMLSpanElement
  private label: HTMLSpanElement
  private pips: HTMLSpanElement
  private episodeEl: HTMLSpanElement
  private curve: SVGPathElement
  private head: SVGCircleElement

  private beats: Array<BeatRecord> = []

  constructor() {
    this.root = el("div", "dc-live flex items-center gap-3")
    this.root.dataset.empty = "true"

    this.emoji = el("span", "dc-live-emoji flex items-center justify-center")

    const text = el("div", "dc-live-text flex flex-col")
    this.label = el("span", "dc-live-label")
    this.pips = el("span", "dc-live-pips")
    text.appendChild(this.label)
    text.appendChild(this.pips)

    const curveWrap = el("div", "dc-live-curve-wrap flex flex-col")
    const svg = document.createElementNS(SVG_NS, "svg")
    svg.setAttribute("class", "dc-live-curve")
    svg.setAttribute("viewBox", `0 0 ${CURVE_W} ${CURVE_H}`)
    svg.setAttribute("aria-hidden", "true")
    const baseline = document.createElementNS(SVG_NS, "line")
    baseline.setAttribute("class", "dc-live-baseline")
    baseline.setAttribute("x1", "0")
    baseline.setAttribute("x2", String(CURVE_W))
    baseline.setAttribute("y1", String(CURVE_H / 2))
    baseline.setAttribute("y2", String(CURVE_H / 2))
    this.curve = document.createElementNS(SVG_NS, "path")
    this.curve.setAttribute("class", "dc-live-path")
    this.head = document.createElementNS(SVG_NS, "circle")
    this.head.setAttribute("class", "dc-live-head")
    this.head.setAttribute("r", "3")
    svg.appendChild(baseline)
    svg.appendChild(this.curve)
    svg.appendChild(this.head)
    this.episodeEl = el("span", "dc-live-episode")
    curveWrap.appendChild(svg)
    curveWrap.appendChild(this.episodeEl)

    this.root.appendChild(this.emoji)
    this.root.appendChild(text)
    this.root.appendChild(curveWrap)

    this.setBeats("", [])
  }

  // ── Public interface ────────────────────────────────────────────────────────

  /** Replace the episode's beats (initial load, episode change). No pulse. */
  setBeats(episode: string, beats: ReadonlyArray<BeatRecord>): void {
    this.beats = [...beats]
    this.episodeEl.textContent = episode
    this.renderCurve()
    this.renderLatest(false)
  }

  /**
   * Add a beat, or replace it when it is an escalation of one already shown
   * (same id). A beat from a different episode starts that episode's curve.
   */
  pushBeat(beat: BeatRecord): void {
    const first = this.beats[0]
    if (first && first.episode !== beat.episode) {
      this.beats = []
    }
    const i = this.beats.findIndex((b) => b.id === beat.id)
    if (i >= 0) this.beats[i] = beat
    else this.beats.push(beat)
    this.episodeEl.textContent = beat.episode
    this.renderCurve()
    this.renderLatest(true)
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  private latest(): BeatRecord | undefined {
    return this.beats.reduce<BeatRecord | undefined>(
      (a, b) => (a === undefined || b.updatedAt > a.updatedAt ? b : a),
      undefined
    )
  }

  private renderLatest(pulse: boolean): void {
    const beat = this.latest()
    const mood = MOODS.find((m) => m.type === beat?.mood)
    this.root.dataset.empty = beat ? "false" : "true"

    if (!beat || !mood) {
      this.emoji.textContent = "🎬"
      this.label.textContent = "waiting for a beat…"
      this.pips.textContent = ""
      return
    }

    this.emoji.textContent = mood.emoji
    this.label.textContent = mood.label
    this.pips.textContent =
      "●".repeat(beat.intensity) + "○".repeat(3 - beat.intensity)
    this.root.dataset.intensity = String(beat.intensity)
    this.root.style.setProperty("--dc-beat-hue", String(mood.hue))
    this.root.style.setProperty(
      "--dc-beat-decay",
      `${decayMs(beat.intensity)}ms`
    )

    if (pulse) {
      // Restart the pulse animation: drop the class, force a style flush, re-add.
      this.root.classList.remove("dc-live-pulse")
      void this.root.offsetWidth
      this.root.classList.add("dc-live-pulse")
    }
  }

  private renderCurve(): void {
    const points = episodeCurve(this.beats)
    this.curve.setAttribute("d", curvePath(points, CURVE_W, CURVE_H))
    const last = points.at(-1)
    this.head.style.display = last ? "" : "none"
    if (last) {
      this.head.setAttribute("cx", (last.x * CURVE_W).toFixed(1))
      this.head.setAttribute(
        "cy",
        (CURVE_H / 2 - (last.y * CURVE_H) / 2).toFixed(1)
      )
    }
  }
}
