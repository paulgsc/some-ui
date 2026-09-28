// ── DramaCard ─────────────────────────────────────────────────────────────────
// Top-level orchestrator. Owns: root DOM assembly, size state, mood hue,
// title pill, visibility. Delegates all other concerns to sub-components.
//
// Sub-component responsibilities:
//   Slideshow       — circle ring, slides, nav dots, chat bubble
//   RightPanel      — episode/timestamp, progress, stats, mood strip
//   CapturePanel    — expandable emotion picker
//   LiveStrip       — beat pulse + episode curve (the broadcast surface)
//   Spotlight       — the latest change, shown as the card's face for a while
//   DragController  — pointer drag logic
//   spawnBlossoms   — particle layer
//
// Theme and spotlight: the card wears its current mood — the latest beat's,
// else the entry's — as a theme (--dc-hue / --dc-hue-2 / --dc-sat, from
// MOODS; theme.css derives every colour from them), and the petals follow it.
// A change — a beat, a rating, a likelihood to finish — takes over the card's
// face for SPOTLIGHT_MS with an effect of its own, bursts petals, and then
// hands the face back. A newer change restarts that.
//
// Resources (Charter §7/§8): the card owns one lifetime, `life`, and every
// resource it holds is acquired against it or a child of it — destroy() is
// one dispose. What should run only while someone can see the card (the
// slideshow's timer, the blossom layer, its CSS animations) is acquired in
// one place, the ActiveScope's start(), and runs only while no hold is on:
// "entering" (before the first frame), "min", "hidden". Any hold disposes
// that scope, so there is no stop path to keep in step with the start path.
// A card on a page that is not showing, or one the user toggled off, is never
// built at all (display.ts); "hidden" is for a card held on screen hidden.
//
// Live position: given the source tab's latest report (setPlayback), the
// episode row shows where the drama is now instead of the entry's saved
// position, and a one-second clock moves it along. The clock is a second
// ActiveScope nested in the first — so it stops whenever the card is dormant —
// held "paused" whenever the video's time isn't moving (paused, stalled,
// ended, no source): it ticks only while someone can see it *and* the drama
// is playing. It only extrapolates: it never reads a video or sends a
// message. Both limits are tested in tests/card-lifetime.test.ts — "runs its
// clock only while the drama plays…" and "ticks no faster than once a
// second…" (so a per-frame loop can't come back as a faster interval).

import { CapturePanel } from "@drama/components/capture-panel"
import { DragController } from "@drama/components/drag-controller"
import { LiveStrip } from "@drama/components/live-strip"
import { RightPanel } from "@drama/components/right-panel"
import { Slideshow } from "@drama/components/slideshow"
import { Spotlight } from "@drama/components/spotlight"
import { el } from "@drama/effects/content/dom"
import { spawnBlossoms } from "@drama/effects/content/particles"
import type { Blossoms } from "@drama/effects/content/particles"
import {
  DEFAULT_THEME,
  MOODS,
  SIZE_CYCLE,
} from "@drama/logic/content/constants"
import {
  SPOTLIGHT_MS,
  spotlightView,
  verdictSpotlight,
} from "@drama/logic/content/spotlight"
import { fitInViewport } from "@drama/logic/content/utils"
import { livePosition } from "@drama/logic/playback"
import { verdictTrend } from "@drama/logic/verdict-log"
import type {
  BeatRecord,
  CardEvents,
  CardSize,
  CardState,
  MoodType,
  SourceReport,
  Spotlight as SpotlightContent,
  VerdictRecord,
} from "@drama/types"
import { ActiveScope, Disposables } from "@some-extension/common"

// The least gap kept between the card and the viewport's edges.
const VIEWPORT_MARGIN = 8

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
  private liveStrip: LiveStrip
  private spotlight: Spotlight
  private drag: DragController

  // State
  private state: CardState
  private currentSize: CardSize = "compact"
  private events: CardEvents
  // The latest beat's mood; it outranks the entry's activeMood for the theme,
  // since a beat is newer than anything saved in the popup.
  private beatMood: MoodType | null = null

  // Lifetimes — see the header.
  private readonly life = new Disposables()
  private readonly active: ActiveScope<"entering" | "min" | "hidden">
  private blossoms: Blossoms | null = null
  private spotlit: Disposables | null = null
  private clock: ActiveScope<"paused"> | null = null

  // The source tab's latest report; null shows the entry's saved position.
  private playback: SourceReport | null = null

  // Where the card wants to be (a saved position, or where it was dropped).
  // What is shown is that, fitted into the viewport — see fit().
  private anchor = { x: 0, y: 0 }

  constructor(container: HTMLElement, initial: CardState, events: CardEvents) {
    this.state = { ...initial }
    this.events = events

    // ── Root ──────────────────────────────────────────────────────────────────
    this.root = el("div")
    this.root.id = "dc-root"
    this.root.dataset.size = this.currentSize

    // ── Title pill ────────────────────────────────────────────────────────────
    const titlePill = el(
      "div",
      "dc-title-pill flex items-center overflow-hidden"
    )
    const titleDot = el("span", "dc-title-dot")
    this.titleText = el("span", "dc-title-text")
    titlePill.appendChild(titleDot)
    titlePill.appendChild(this.titleText)

    // ── Card shell ────────────────────────────────────────────────────────────
    this.card = el(
      "div",
      "dc-card flex flex-row items-end overflow-visible relative cursor-grab"
    )
    this.sizeBtn = el("button", "dc-size-btn flex items-center justify-center")
    this.sizeBtn.title = "Resize"
    this.sizeBtn.textContent = "⊞"

    // ── Sub-components ────────────────────────────────────────────────────────
    this.slideshow = new Slideshow()
    this.rightPanel = new RightPanel()
    this.capturePanel = new CapturePanel(this.life)
    this.liveStrip = new LiveStrip()
    this.spotlight = new Spotlight()

    // ── Assemble card ─────────────────────────────────────────────────────────
    this.card.appendChild(this.slideshow.wrap)
    this.card.appendChild(this.rightPanel.root)
    this.card.appendChild(this.spotlight.root)
    this.card.appendChild(this.sizeBtn)

    // ── Assemble root (top → bottom in flex-column-reverse visual order) ──────
    this.root.appendChild(titlePill)
    this.root.appendChild(this.capturePanel.root)
    this.root.appendChild(this.liveStrip.root)
    this.root.appendChild(this.card)

    container.appendChild(this.root)

    // ── Wire sub-component events ─────────────────────────────────────────────
    this.wireEvents()

    // ── Drag controller ───────────────────────────────────────────────────────
    this.drag = new DragController(
      this.card,
      this.root,
      [
        "button",
        ".dc-mood-dot",
        // ".dc-circle-wrap",
      ],
      this.life
    )
    this.drag.onMove = (x, y): void => {
      this.anchor = { x, y }
      this.applyPosition(x, y)
    }
    this.drag.onDragEnd = (x, y): void => this.events.onDragEnd(x, y)

    // A smaller window must not strand the card off screen; refit from its
    // anchor, so growing the window back restores where it was.
    window.addEventListener("resize", () => this.fit(), {
      signal: this.life.signal,
    })

    // ── Initial render ────────────────────────────────────────────────────────
    this.applyState()
    this.slideshow.setSlide(0)

    // ── Activity ──────────────────────────────────────────────────────────────
    // Dormant until the entrance frame; see the header.
    this.root.classList.add("dc-dormant")
    this.active = new ActiveScope(
      this.life,
      (scope) => {
        this.root.classList.remove("dc-dormant")
        scope.add(() => this.root.classList.add("dc-dormant"))
        this.slideshow.startAutoAdvance(scope)
        this.blossoms = spawnBlossoms(this.root, scope, this.petalLook())
        scope.add(() => {
          this.blossoms = null
        })
        this.renderPosition()
        this.clock = new ActiveScope(
          scope,
          (ticking) => ticking.interval(() => this.renderPosition(), 1_000),
          this.playback?.advancing ? [] : ["paused"]
        )
        scope.add(() => {
          this.clock = null
        })
      },
      ["entering"]
    )

    // ── Entrance ──────────────────────────────────────────────────────────────
    // After first paint, so the fade-in has a start state; cancelled with the
    // card if it is replaced before then.
    this.life.frame(() => {
      this.root.classList.add("dc-visible")
      this.active.release("entering")
    })
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Apply new state in place. A changed rating or likelihood to finish is
   * spotlit — this is how a verdict set anywhere (hotkey, card, popup) shows.
   */
  update(patch: Partial<CardState>): void {
    const prev = this.state
    this.state = { ...this.state, ...patch }
    this.applyState()
    const spot = verdictSpotlight(prev, this.state)
    if (spot) {
      this.blossoms?.restyle(this.petalLook())
      this.showSpotlight(spot, 1)
    }
  }

  /** The source tab's latest report (null: none), for the live position. */
  setPlayback(report: SourceReport | null): void {
    this.playback = report
    this.renderPosition()
    this.clock?.hold("paused", !report?.advancing)
  }

  /** Load an episode's beats into the live strip (no pulse, no spotlight). */
  setBeats(episode: string, beats: ReadonlyArray<BeatRecord>): void {
    this.liveStrip.setBeats(episode, beats)
    const latest = beats.at(-1)
    if (latest) this.showMood(latest.mood)
  }

  /**
   * A beat was just logged or escalated: pulse the strip, re-theme, and
   * spotlight it — harder for each escalation.
   */
  pushBeat(beat: BeatRecord): void {
    this.liveStrip.pushBeat(beat)
    this.showMood(beat.mood)
    this.showSpotlight(
      {
        kind: "mood",
        mood: beat.mood,
        intensity: beat.intensity,
        videoTime: beat.videoTime,
      },
      beat.intensity
    )
  }

  /** Load the drama's verdict history into the rating slide's trend. */
  setVerdictLog(verdicts: ReadonlyArray<VerdictRecord>): void {
    this.slideshow.applyTrendState(
      verdictTrend(verdicts, "rating"),
      verdictTrend(verdicts, "completionLikelihood")
    )
  }

  /** Place the card at (x, y), or as near as fits in the viewport. */
  setPosition(x: number, y: number): void {
    this.anchor = { x, y }
    this.fit()
  }

  setSize(size: CardSize, emit = true): void {
    this.currentSize = size
    this.root.dataset.size = size
    if (emit) this.events.onSizeChange(size)
    // Close capture panel when minimising
    if (size === "min" && this.capturePanel.isOpen) this.capturePanel.close()
    this.active.hold("min", size === "min")
    // Bubble only visible in full + poster slide
    this.syncBubbleVisibility()
    // The card's box changed: keep it on screen (fit repositions the
    // blossoms, which anchor to it).
    this.fit()
  }

  setVisible(v: boolean): void {
    this.root.classList.toggle("dc-hidden", !v)
    this.active.hold("hidden", !v)
  }

  destroy(): void {
    this.life.dispose()
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

      const nextSize =
        SIZE_CYCLE[(idx + 1) % SIZE_CYCLE.length] ?? this.currentSize
      this.setSize(nextSize)
    })

    // Circle click → advance slide
    this.slideshow.onSlideClick = (): void => {
      if (this.drag.didDrag) return
      this.slideshow.setSlide(
        (this.slideshow.current + 1) % this.slideshow.slideCount
      )
      this.syncBubbleVisibility()
      this.slideshow.restartAutoAdvance()
    }

    // Mood selection from the right panel dots or the capture panel. The
    // beat's BEAT_LOGGED echo (pushBeat) spotlights it; the theme turns now.
    this.rightPanel.onMoodSelect = (mood): void => {
      this.events.onMoodSelect(mood)
      this.showMood(mood)
    }
    this.capturePanel.onMoodSelect = (mood): void => {
      this.events.onMoodSelect(mood)
      this.showMood(mood)
    }

    // Stars and finish choices: the STATE_UPDATE echo (update) spotlights.
    this.capturePanel.onVerdict = (field, change): void => {
      this.events.onVerdict(field, change)
    }
  }

  private applyState(): void {
    const s = this.state

    // Title pill
    this.titleText.textContent = s.dramaTitle

    // Delegate to sub-components
    this.slideshow.applyAxesState(s.axes)
    this.slideshow.applyTransitionState(s.transition)
    this.slideshow.applyPosterState(s)
    this.slideshow.applyTagsState(s.tags, s.peakLine)
    this.slideshow.applyMomentumState(s.momentum)
    this.slideshow.applyAtmosphereState(s.axes)
    this.slideshow.applyRatingState(s.rating)
    this.slideshow.applySummaryState(s)
    this.rightPanel.applyState(s)
    this.renderPosition()
    this.capturePanel.setVerdicts(s.rating, s.completionLikelihood)

    // Theme: the latest beat's mood, else the entry's
    const mood = this.beatMood ?? s.activeMood
    this.applyTheme(mood)
    if (mood) this.rightPanel.setMoodActive(mood)

    // Bubble
    this.syncBubbleVisibility()
  }

  /** The live position when there is a report, else the entry's. */
  private renderPosition(): void {
    if (!this.playback) {
      this.rightPanel.setPosition(this.state)
      return
    }
    const live = livePosition(this.playback, Date.now())
    this.rightPanel.setPosition({
      ...live,
      episode: live.episode || this.state.episode,
    })
  }

  private showMood(mood: MoodType): void {
    const changed = mood !== this.beatMood
    this.beatMood = mood
    this.applyTheme(mood)
    this.rightPanel.setMoodActive(mood)
    if (changed) this.blossoms?.restyle(this.petalLook())
  }

  private petalLook(): { mood: MoodType | null; rating: number } {
    return {
      mood: this.beatMood ?? this.state.activeMood,
      rating: this.state.rating,
    }
  }

  private applyTheme(mood: MoodType | null): void {
    const theme = MOODS.find((x) => x.type === mood) ?? DEFAULT_THEME
    if (mood) this.root.dataset.mood = mood
    else delete this.root.dataset.mood
    this.root.style.setProperty("--dc-hue", String(theme.hue))
    this.root.style.setProperty("--dc-hue-2", String(theme.accent))
    this.root.style.setProperty("--dc-sat", String(theme.sat))
  }

  /**
   * Make `content` the card's face for SPOTLIGHT_MS, and burst petals for it.
   * The timer is one-shot on a child of the card's lifetime, replaced by the
   * next spotlight and gone with the card.
   */
  private showSpotlight(content: SpotlightContent, strength: 1 | 2 | 3): void {
    this.spotlit?.dispose()
    const spotlit = this.life.child()
    this.spotlit = spotlit

    // Cleared before show(), whose layout read restarts the card's flare too.
    delete this.root.dataset.spot
    this.spotlight.show(spotlightView(content), strength)
    this.root.dataset.spot = content.kind
    this.blossoms?.burst(
      content.kind === "mood"
        ? { kind: "mood", mood: content.mood, intensity: content.intensity }
        : { kind: content.kind, rising: content.delta >= 0 }
    )

    spotlit.timeout(() => {
      this.spotlight.clear()
      delete this.root.dataset.spot
    }, SPOTLIGHT_MS)
  }

  private syncBubbleVisibility(): void {
    const visible =
      this.slideshow.current === this.slideshow.posterSlideIndex &&
      this.currentSize === "full"
    this.slideshow.setBubbleVisible(visible)
  }

  /** Show the card at its anchor, moved just enough to be wholly visible. */
  private fit(): void {
    const rect = this.root.getBoundingClientRect()
    const at = fitInViewport(
      this.anchor,
      rect,
      { width: window.innerWidth, height: window.innerHeight },
      VIEWPORT_MARGIN
    )
    this.applyPosition(at.x, at.y)
  }

  private applyPosition(x: number, y: number): void {
    this.root.style.left = `${x}px`
    this.root.style.top = `${y}px`
    this.root.style.right = "unset"
    this.root.style.bottom = "unset"
    this.blossoms?.reposition()
  }
}
