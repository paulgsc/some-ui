// ── DramaCard ─────────────────────────────────────────────────────────────────
// Top-level orchestrator. Owns: root DOM assembly, size state, mood hue,
// title pill, visibility. Delegates all other concerns to sub-components.
//
// Sub-component responsibilities:
//   Slideshow       — circle ring, slides, nav dots, chat bubble
//   RightPanel      — episode/timestamp, progress, stats, mood strip
//   CapturePanel    — expandable emotion picker
//   DragController  — pointer drag logic
//   spawnBlossoms   — particle layer

import { CapturePanel } from "@drama/components/capture-panel"
import { DragController } from "@drama/components/drag-controller"
import { RightPanel } from "@drama/components/right-panel"
import { Slideshow } from "@drama/components/slideshow"
import { MOODS, SIZE_CYCLE } from "@drama/lib/content/constants"
import { spawnBlossoms } from "@drama/lib/content/particles"
import { el } from "@drama/lib/content/utils"
import type { CardEvents, CardSize, CardState, MoodType } from "@drama/types"

export class DramaCard {
  // Public — content.ts may need direct root access for positioning
  readonly root: HTMLDivElement

  private titleText: HTMLSpanElement
  private card: HTMLDivElement
  private sizeBtn: HTMLButtonElement

  // Sub-components
  private slideshow: Slideshow
  private rightPanel: RightPanel
  private capturePanel: CapturePanel
  private drag: DragController

  // State
  private state: CardState
  private currentSize: CardSize = "compact"
  private events: CardEvents

  // Particles teardown — assigned in rAF callback, never called before then
  private killBlossoms: (() => void) | null = null

  constructor(container: HTMLElement, initial: CardState, events: CardEvents) {
    this.state = { ...initial }
    this.events = events

    // ── Root ──────────────────────────────────────────────────────────────────
    this.root = el("div")
    this.root.id = "dc-root"
    this.root.dataset.size = this.currentSize

    // ── Title pill ────────────────────────────────────────────────────────────
    const titlePill = el("div", "dc-title-pill")
    const titleDot = el("span", "dc-title-dot")
    this.titleText = el("span", "dc-title-text")
    titlePill.appendChild(titleDot)
    titlePill.appendChild(this.titleText)

    // ── Card shell ────────────────────────────────────────────────────────────
    this.card = el("div", "dc-card")
    this.sizeBtn = el("button", "dc-size-btn")
    this.sizeBtn.title = "Resize"
    this.sizeBtn.textContent = "⊞"

    // ── Sub-components ────────────────────────────────────────────────────────
    this.slideshow = new Slideshow()
    this.rightPanel = new RightPanel()
    this.capturePanel = new CapturePanel()

    // ── Assemble card ─────────────────────────────────────────────────────────
    this.card.appendChild(this.slideshow.wrap)
    this.card.appendChild(this.rightPanel.root)
    this.card.appendChild(this.sizeBtn)

    // ── Assemble root (top → bottom in flex-column-reverse visual order) ──────
    this.root.appendChild(titlePill)
    this.root.appendChild(this.capturePanel.root)
    this.root.appendChild(this.card)

    container.appendChild(this.root)

    // ── Wire sub-component events ─────────────────────────────────────────────
    this.wireEvents()

    // ── Drag controller ───────────────────────────────────────────────────────
    this.drag = new DragController(this.card, this.root, [
      "button",
      ".dc-mood-dot",
      ".dc-circle-wrap",
    ])
    this.drag.onMove = (x, y) => this.applyPosition(x, y)
    this.drag.onDragEnd = (x, y) => this.events.onDragEnd(x, y)

    // ── Initial render ────────────────────────────────────────────────────────
    this.applyState()
    this.slideshow.setSlide(0)

    // ── Entrance ──────────────────────────────────────────────────────────────
    requestAnimationFrame(() => {
      this.root.classList.add("dc-visible")
      this.slideshow.startAutoAdvance()
      this.killBlossoms = spawnBlossoms(this.root)
    })
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  update(patch: Partial<CardState>): void {
    const prevMood = this.state.activeMood
    this.state = { ...this.state, ...patch }
    this.applyState()
    if (patch.activeMood !== undefined && patch.activeMood !== prevMood) {
      this.applyMoodHue(this.state.activeMood)
    }
  }

  setPosition(x: number, y: number): void {
    this.applyPosition(x, y)
  }

  setSize(size: CardSize, emit = true): void {
    this.currentSize = size
    this.root.dataset.size = size
    if (emit) this.events.onSizeChange(size)
    // Close capture panel when minimising
    if (size === "min" && this.capturePanel.isOpen) this.capturePanel.close()
    // Bubble only visible in full + poster slide
    this.syncBubbleVisibility()
  }

  setVisible(v: boolean): void {
    this.root.classList.toggle("dc-hidden", !v)
  }

  destroy(): void {
    this.slideshow.destroy()
    this.killBlossoms?.()
    this.root.remove()
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private wireEvents(): void {
    // Card click → toggle capture panel (if not mid-drag)
    this.card.addEventListener("click", () => {
      if (this.drag.didDrag) return
      if (this.currentSize === "min") {
        this.setSize("compact")
        return
      }
      this.capturePanel.toggle()
    })

    // Size toggle button
    this.sizeBtn.addEventListener("click", (e) => {
      e.stopPropagation()
      const idx = SIZE_CYCLE.indexOf(this.currentSize)
      this.setSize(SIZE_CYCLE[(idx + 1) % SIZE_CYCLE.length])
    })

    // Circle click → advance slide
    this.slideshow.onSlideClick = () => {
      if (this.drag.didDrag) return
      this.slideshow.stopAutoAdvance()
      this.slideshow.setSlide((this.slideshow.current + 1) % 3)
      this.syncBubbleVisibility()
      this.slideshow.startAutoAdvance()
    }

    // Mood selection from right panel dots
    this.rightPanel.onMoodSelect = (mood) => {
      this.events.onMoodSelect(mood)
      this.applyMoodHue(mood)
      this.rightPanel.setMoodActive(mood)
      this.slideshow.applyEmotionState(mood, this.state.emotionLabel)
    }

    // Mood selection from capture panel
    this.capturePanel.onMoodSelect = (mood) => {
      this.events.onMoodSelect(mood)
      this.applyMoodHue(mood)
      this.rightPanel.setMoodActive(mood)
      this.slideshow.applyEmotionState(mood, this.state.emotionLabel)
      this.state = { ...this.state, activeMood: mood }
    }
  }

  private applyState(): void {
    const s = this.state

    // Title pill
    this.titleText.textContent = s.dramaTitle

    // Delegate to sub-components
    this.slideshow.applyPosterState(s)
    this.slideshow.applyRatingState(s.rating)
    this.slideshow.applyEmotionState(s.activeMood, s.emotionLabel)
    this.rightPanel.applyState(s)

    // Mood hue
    if (s.activeMood) this.applyMoodHue(s.activeMood)

    // Bubble
    this.syncBubbleVisibility()
  }

  private applyMoodHue(mood: MoodType | null): void {
    const m = MOODS.find((x) => x.type === mood)
    this.root.style.setProperty("--dc-mood-hue", String(m?.hue ?? 340))
  }

  private syncBubbleVisibility(): void {
    const visible = this.slideshow.current === 0 && this.currentSize === "full"
    this.slideshow.setBubbleVisible(visible)
  }

  private applyPosition(x: number, y: number): void {
    this.root.style.left = `${x}px`
    this.root.style.top = `${y}px`
    this.root.style.right = "unset"
    this.root.style.bottom = "unset"
  }
}
