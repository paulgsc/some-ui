// sentiment-widget.ts  v2
// Pure UI layer — zero browser extension APIs, zero logic coupling.

// ─── Types ────────────────────────────────────────────────────────────────────

export type EmotionType =
  | "joy"
  | "sadness"
  | "love"
  | "rage"
  | "fear"
  | "neutral"

export type Emotion = {
  type: EmotionType
  emoji: string
  label: string
  hue: number
}

export type WidgetState = {
  dramaTitle: string
  episode: string // e.g. "Ep 8"
  timestamp: string // e.g. "12:04"
  /** 0–1 ratio of currentTime / duration. Logic layer computes this. */
  progress: number
  activeEmotion: EmotionType | null
  intensity: number // 0–1
  isPlaying: boolean
}

export type WidgetSize = "min" | "compact" | "full"

export type WidgetEvents = {
  onEmotionSelect: (
    emotion: EmotionType,
    intensity: number,
    note: string
  ) => void
  onSizeChange: (size: WidgetSize) => void
  onDragEnd: (x: number, y: number) => void
}

// ─── Constants ────────────────────────────────────────────────────────────────

const EMOTIONS: Array<Emotion> = [
  { type: "joy", emoji: "😊", label: "Joy", hue: 40 },
  { type: "love", emoji: "😍", label: "Love", hue: 340 },
  { type: "sadness", emoji: "😭", label: "Sad", hue: 220 },
  { type: "rage", emoji: "😡", label: "Rage", hue: 0 },
  { type: "fear", emoji: "😱", label: "Fear", hue: 270 },
  { type: "neutral", emoji: "😐", label: "Meh", hue: 200 },
]

/**
 * Inline SVG sigils — one per emotion, shown in "full" size mode.
 * Pure paths, accent-color stroked. No raster, no imports.
 */
const SIGILS: Record<EmotionType, string> = {
  joy: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round">
    <circle cx="10" cy="10" r="7"/>
    <path d="M7 11.5c.8 1.2 5.2 1.2 6 0"/>
    <circle cx="8" cy="8.5" r=".8" fill="currentColor"/>
    <circle cx="12" cy="8.5" r=".8" fill="currentColor"/>
    <path d="M10 3v1M10 16v1M3 10H2M18 10h-1" stroke-width="1"/>
  </svg>`,
  love: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10 16s-7-4.5-7-9a4 4 0 0 1 7-2.65A4 4 0 0 1 17 7c0 4.5-7 9-7 9z"/>
    <path d="M6.5 9.5l1.5 1.5 3-3.5" stroke-width="1"/>
  </svg>`,
  sadness: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round">
    <circle cx="10" cy="9" r="7"/>
    <path d="M7 12.5c.8-1.2 5.2-1.2 6 0"/>
    <circle cx="8" cy="7.5" r=".8" fill="currentColor"/>
    <circle cx="12" cy="7.5" r=".8" fill="currentColor"/>
    <path d="M7.5 5.5c-.5-.8-1.5-.8-2 0M14.5 5.5c-.5-.8-1.5-.8-2 0"/>
    <path d="M8.5 14l-.5 2.5M11.5 14l.5 2.5" stroke-width="1" stroke-dasharray="1 1"/>
  </svg>`,
  rage: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round">
    <circle cx="10" cy="10" r="7"/>
    <path d="M7 12.5c.8-1 5.2-1 6 0"/>
    <path d="M7 7.5l2 1M13 7.5l-2 1"/>
    <path d="M10 3v-1.5M15 5l1-1M17 10h1.5M15 15l1 1M10 17v1.5M5 15l-1 1M3 10H1.5M5 5l-1-1" stroke-width="1"/>
  </svg>`,
  fear: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round">
    <circle cx="10" cy="10" r="7"/>
    <path d="M7.5 12.5h5"/>
    <ellipse cx="8" cy="8" rx="1.2" ry="1.5" fill="currentColor"/>
    <ellipse cx="12" cy="8" rx="1.2" ry="1.5" fill="currentColor"/>
    <path d="M10 3c0 0-1-2-3-1.5M10 3c0 0 1-2 3-1.5" stroke-width="1"/>
  </svg>`,
  neutral: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round">
    <circle cx="10" cy="10" r="7"/>
    <path d="M7.5 12h5"/>
    <circle cx="8" cy="8.5" r=".8" fill="currentColor"/>
    <circle cx="12" cy="8.5" r=".8" fill="currentColor"/>
  </svg>`,
}

const SIZE_CYCLE: Array<WidgetSize> = ["compact", "full", "min"]
const IDLE_TIMEOUT_MS = 3_000

// ─── Inject keyframes into document ───────────────────────────────────────────
// CSS animations require keyframes to be defined in a stylesheet.
// We inject them once when the module loads.

let keyframesInjected = false

function injectKeyframes(): void {
  if (keyframesInjected) return
  keyframesInjected = true

  const style = document.createElement("style")
  style.id = "sw-keyframes"
  style.textContent = `
    @keyframes sw-confetti-fly {
      0% {
        opacity: 0;
        transform: translate(-50%, -50%) rotate(0deg) scale(0.5);
      }
      15% {
        opacity: 1;
      }
      80% {
        opacity: 0.8;
      }
      100% {
        opacity: 0;
        transform: translate(calc(-50% + var(--tx)), calc(-50% + var(--ty))) rotate(360deg) scale(0.3);
      }
    }

    @keyframes sw-petal-rise {
      0% {
        opacity: 0;
        transform: translate(0, 0) rotate(0deg) scale(0.6);
      }
      15% {
        opacity: 0.9;
      }
      100% {
        opacity: 0;
        transform: translate(var(--tx, 0), -60px) rotate(180deg) scale(1.2);
      }
    }

    @keyframes sw-drip {
      0% {
        opacity: 0;
        transform: scaleY(0);
      }
      20% {
        opacity: 0.8;
        transform: scaleY(1);
      }
      100% {
        opacity: 0;
        transform: scaleY(1) translateY(24px);
      }
    }

    @keyframes sw-ember-burst {
      0% {
        opacity: 0;
        transform: translate(-50%, -50%) scale(0.4);
      }
      10% {
        opacity: 1;
      }
      100% {
        opacity: 0;
        transform: translate(calc(-50% + var(--tx)), calc(-50% + var(--ty))) scale(0.1);
      }
    }

    @keyframes sw-ripple-expand {
      0% {
        opacity: 0.7;
        transform: scale(1);
      }
      100% {
        opacity: 0;
        transform: scale(2.4);
      }
    }

    @keyframes sw-shake {
      0%, 100% { transform: translateX(0); }
      15% { transform: translateX(-5px) rotate(-1deg); }
      30% { transform: translateX(5px) rotate(1deg); }
      45% { transform: translateX(-4px); }
      60% { transform: translateX(4px); }
      75% { transform: translateX(-2px); }
      90% { transform: translateX(2px); }
    }

    @keyframes sw-quiver {
      0%, 100% { transform: translateX(0) rotate(0); }
      20% { transform: translateX(-2px) rotate(-0.5deg); }
      40% { transform: translateX(2px) rotate(0.5deg); }
      60% { transform: translateX(-2px) rotate(-0.5deg); }
      80% { transform: translateX(2px) rotate(0.5deg); }
    }

    @keyframes sw-shudder {
      0%, 100% { transform: translateY(0); }
      25% { transform: translateY(-2px); }
      75% { transform: translateY(2px); }
    }

    .sw-effect-shake {
      animation: sw-shake 0.5s cubic-bezier(0.22, 1, 0.36, 1) forwards !important;
    }
    .sw-effect-quiver {
      animation: sw-quiver 0.45s ease-in-out forwards !important;
    }
    .sw-effect-shudder {
      animation: sw-shudder 0.55s ease-in-out forwards !important;
    }
  `
  document.head.appendChild(style)
}

// ─── Particle effect engine ───────────────────────────────────────────────────
// All effects: fixed-position overlay divs, CSS-only animation, self-removing.
// No canvas, no requestAnimationFrame loops, no external libs.

function rnd(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

type ParticleFactory = (i: number, total: number) => HTMLDivElement

/**
 * Emotion-keyed particle effects.
 * Each effect fires on the pill element at capture time.
 */
const EFFECTS: Record<EmotionType, (pill: HTMLElement) => void> = {
  joy(pill) {
    spawnParticles(pill, 20, 1400, (i, total) => {
      const el = document.createElement("div")
      const angle = (i / total) * Math.PI * 2
      const dist = rnd(40, 90)

      // Geometry constants
      const tx = Math.cos(angle) * dist
      const ty = Math.sin(angle) * dist
      const size = rnd(4, 8)

      // Base Styles
      Object.assign(el.style, {
        position: "absolute",
        left: "50%",
        top: "50%",
        width: `${size}px`,
        height: `${size}px`,
        backgroundColor: `hsl(${rnd(20, 60)}deg 95% 70%)`,
        borderRadius: "2px",
        opacity: "0",
        pointerEvents: "none",
        // Force initial state to match first keyframe
        transform: "translate(-50%, -50%) scale(0.5) rotate(0deg)",
      })

      // Animation variables
      el.style.setProperty("--tx", `${tx.toFixed(2)}px`)
      el.style.setProperty("--ty", `${ty.toFixed(2)}px`)

      // Animation trigger
      el.style.animationName = "sw-confetti-fly"
      el.style.animationDuration = "1.2s"
      el.style.animationTimingFunction = "cubic-bezier(0.22, 1, 0.36, 1)"
      el.style.animationFillMode = "forwards"
      el.style.animationDelay = `${rnd(0, 150)}ms`

      return el
    })
  },

  love(pill) {
    spawnParticles(pill, 12, 2000, (i) => {
      const el = document.createElement("div")
      const startX = rnd(-10, pill.offsetWidth + 10)
      const tx = rnd(-30, 30)

      Object.assign(el.style, {
        position: "absolute",
        left: `${startX}px`,
        bottom: "0px",
        width: "10px",
        height: "10px",
        backgroundColor: `hsl(${rnd(335, 355)}deg 90% 75%)`,
        borderRadius: "50% 50% 40% 40%",
        opacity: "0",
        transformOrigin: "bottom center",
      })

      el.style.setProperty("--tx", `${tx.toFixed(2)}px`)
      el.style.animationName = "sw-petal-rise"
      el.style.animationDuration = `${rnd(1.5, 2.2)}s`
      el.style.animationTimingFunction = "ease-out"
      el.style.animationFillMode = "forwards"
      el.style.animationDelay = `${rnd(0, 400)}ms`

      return el
    })
  },

  sadness(pill) {
    pill.classList.add("sw-effect-shudder")
    setTimeout(() => pill.classList.remove("sw-effect-shudder"), 600)

    spawnParticles(pill, 8, 1800, (i, total) => {
      const el = document.createElement("div")
      const xPos =
        (i / (total - 1)) * (pill.offsetWidth * 0.8) + pill.offsetWidth * 0.1

      Object.assign(el.style, {
        position: "absolute",
        left: `${xPos}px`,
        top: "100%",
        width: "2px",
        height: `${rnd(10, 25)}px`,
        background:
          "linear-gradient(to bottom, hsl(210 80% 70% / 0.8), transparent)",
        borderRadius: "0 0 4px 4px",
        transformOrigin: "top center",
        opacity: "0",
      })

      el.style.animationName = "sw-drip"
      el.style.animationDuration = `${rnd(1, 1.8)}s`
      el.style.animationTimingFunction = "ease-in"
      el.style.animationFillMode = "forwards"
      el.style.animationDelay = `${rnd(0, 500)}ms`

      return el
    })
  },

  rage(pill) {
    pill.classList.add("sw-effect-shake")
    setTimeout(() => pill.classList.remove("sw-effect-shake"), 500)

    spawnParticles(pill, 25, 1000, (i, total) => {
      const el = document.createElement("div")
      const angle = (i / total) * Math.PI * 2 + rnd(-0.2, 0.2)
      const dist = rnd(30, 100)

      Object.assign(el.style, {
        position: "absolute",
        left: "50%",
        top: "50%",
        width: `${rnd(3, 6)}px`,
        height: `${rnd(3, 6)}px`,
        backgroundColor: `hsl(${rnd(-10, 25)}deg 100% 60%)`,
        borderRadius: "50%",
        opacity: "0",
        transform: "translate(-50%, -50%) scale(0)",
      })

      el.style.setProperty("--tx", `${(Math.cos(angle) * dist).toFixed(2)}px`)
      el.style.setProperty("--ty", `${(Math.sin(angle) * dist).toFixed(2)}px`)

      el.style.animationName = "sw-ember-burst"
      el.style.animationDuration = "0.8s"
      el.style.animationTimingFunction = "cubic-bezier(0.15, 0.85, 0.35, 1)"
      el.style.animationFillMode = "forwards"
      el.style.animationDelay = `${rnd(0, 100)}ms`

      return el
    })
  },

  fear(pill) {
    pill.classList.add("sw-effect-quiver")
    setTimeout(() => pill.classList.remove("sw-effect-quiver"), 500)

    spawnParticles(pill, 4, 1500, (i) => {
      const el = document.createElement("div")
      const size = 25 + i * 30

      Object.assign(el.style, {
        position: "absolute",
        left: "50%",
        top: "50%",
        width: `${size}px`,
        height: `${size}px`,
        marginLeft: `-${size / 2}px`,
        marginTop: `-${size / 2}px`,
        border: "2px solid hsl(270 80% 75% / 0.6)",
        borderRadius: "50%",
        opacity: "0",
        pointerEvents: "none",
      })

      el.style.animationName = "sw-ripple-expand"
      el.style.animationDuration = "1.2s"
      el.style.animationTimingFunction = "ease-out"
      el.style.animationFillMode = "forwards"
      el.style.animationDelay = `${i * 150}ms`

      return el
    })
  },

  neutral(pill) {
    spawnParticles(pill, 2, 1000, (i) => {
      const el = document.createElement("div")
      const size = 40 + i * 25

      Object.assign(el.style, {
        position: "absolute",
        left: "50%",
        top: "50%",
        width: `${size}px`,
        height: `${size}px`,
        marginLeft: `-${size / 2}px`,
        marginTop: `-${size / 2}px`,
        border: "1px solid hsl(200 20% 70% / 0.4)",
        borderRadius: "50%",
        opacity: "0",
      })

      el.style.animationName = "sw-ripple-expand"
      el.style.animationDuration = "0.9s"
      el.style.animationTimingFunction = "ease-out"
      el.style.animationFillMode = "forwards"
      el.style.animationDelay = `${i * 200}ms`

      return el
    })
  },
}

/**
 * Enhanced layer factory with explicit z-index and overflow handling.
 */
function spawnParticles(
  anchor: HTMLElement,
  count: number,
  lifetime: number,
  factory: ParticleFactory
): void {
  const rect = anchor.getBoundingClientRect()
  const layer = document.createElement("div")

  // High-priority styles for the container
  Object.assign(layer.style, {
    position: "fixed",
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    pointerEvents: "none",
    overflow: "visible",
    zIndex: "2147483647", // Maximum safe integer for top-level visibility
    display: "block",
  })

  for (let i = 0; i < count; i++) {
    const p = factory(i, count)
    layer.appendChild(p)
  }

  document.body.appendChild(layer)
  setTimeout(() => layer.remove(), lifetime)
}

// ─── SentimentWidget ──────────────────────────────────────────────────────────

export class SentimentWidget {
  private root: HTMLDivElement
  private pill: HTMLDivElement
  private panel: HTMLDivElement
  private progressBar: HTMLDivElement
  private titleTrack: HTMLDivElement
  private titleInner: HTMLSpanElement
  private sigilEl: HTMLDivElement
  private emojiSlots: Map<EmotionType, HTMLButtonElement> = new Map()
  private intensitySlider: HTMLInputElement
  private noteInput: HTMLInputElement
  private captureBtn: HTMLButtonElement
  private sizeBtn: HTMLButtonElement
  private episodeEl: HTMLSpanElement
  private timestampEl: HTMLSpanElement
  private moodEl: HTMLSpanElement

  private state: WidgetState
  private currentSize: WidgetSize = "compact"
  private panelOpen = false
  private selectedEmotion: EmotionType | null = null

  private dragging = false
  private dragOffsetX = 0
  private dragOffsetY = 0
  private didMove = false

  private idleTimer: ReturnType<typeof setTimeout> | null = null
  private events: WidgetEvents

  constructor(
    container: HTMLElement,
    initialState: WidgetState,
    events: WidgetEvents
  ) {
    // Inject keyframes on first widget instantiation
    injectKeyframes()

    this.state = { ...initialState }
    this.events = events

    this.root = this.mk("div", "sw-root")
    this.pill = this.mk("div", "sw-pill")
    this.panel = this.mk("div", "sw-panel")
    this.progressBar = this.mk("div", "sw-progress-bar")
    this.titleTrack = this.mk("div", "sw-title-track")
    this.titleInner = this.mk("span", "sw-title-inner")
    this.sigilEl = this.mk("div", "sw-sigil")
    this.moodEl = this.mk("span", "sw-mood")
    this.episodeEl = this.mk("span", "sw-episode")
    this.timestampEl = this.mk("span", "sw-timestamp")
    this.intensitySlider = this.createSlider()
    this.noteInput = this.createNoteInput()
    this.captureBtn = this.createCaptureBtn()
    this.sizeBtn = this.createSizeBtn()

    this.titleTrack.appendChild(this.titleInner)

    this.buildPill()
    this.buildPanel()

    // Panel above pill in DOM (visually below, since root is column-reverse in CSS)
    this.root.appendChild(this.panel)
    this.root.appendChild(this.pill)
    container.appendChild(this.root)

    this.applyState()
    this.bindInteractions()

    // Start with hidden or low opacity
    this.root.classList.add("sw-hidden")
    container.appendChild(this.root)

    // Trigger entrance after injection
    requestAnimationFrame(() => {
      this.root.classList.remove("sw-hidden")
      this.setSize(this.currentSize, false)
      // Force a marquee check once the size is set and painted
      this.updateMarquee()
    })
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /** Logic layer calls this on every state tick (e.g. rAF or 1s interval). */
  update(state: Partial<WidgetState>): void {
    const prevEmotion = this.state.activeEmotion
    this.state = { ...this.state, ...state }
    this.applyState()

    // If activeEmotion was updated, sync the panel selection state and trigger effect
    if (
      state.activeEmotion !== undefined &&
      state.activeEmotion !== prevEmotion
    ) {
      const emotion = EMOTIONS.find((e) => e.type === state.activeEmotion)
      if (emotion) {
        this.selectedEmotion = emotion.type
        this.root.style.setProperty("--sw-accent-hue", String(emotion.hue))
        this.emojiSlots.forEach((btn, key) =>
          btn.classList.toggle("sw-emotion-btn--selected", key === emotion.type)
        )
        // Trigger particle effect on emotion change
        EFFECTS[emotion.type](this.pill)
      } else {
        // Clear selection if emotion is null
        this.selectedEmotion = null
        this.emojiSlots.forEach((btn) =>
          btn.classList.remove("sw-emotion-btn--selected")
        )
      }
    }
  }

  /** Programmatically set the active emotion (updates pill emoji and panel selection). */
  setEmotion(type: EmotionType | null, animate = true): void {
    if (type === null) {
      this.state.activeEmotion = null
      this.selectedEmotion = null
      this.moodEl.textContent = "⬤"
      this.sigilEl.innerHTML = ""
      this.emojiSlots.forEach((btn) =>
        btn.classList.remove("sw-emotion-btn--selected")
      )
      return
    }

    const emotion = EMOTIONS.find((e) => e.type === type)
    if (emotion) {
      // Update state without triggering selectEmotion's effect if animate is false
      this.selectedEmotion = emotion.type
      this.state.activeEmotion = type
      this.root.style.setProperty("--sw-accent-hue", String(emotion.hue))
      this.emojiSlots.forEach((btn, key) =>
        btn.classList.toggle("sw-emotion-btn--selected", key === emotion.type)
      )
      this.moodEl.textContent = emotion.emoji
      this.sigilEl.innerHTML = SIGILS[emotion.type]

      if (animate) {
        EFFECTS[emotion.type](this.pill)
      }
    }
  }

  /** Suppress for fullscreen; restore on exit. */
  setVisible(visible: boolean): void {
    this.root.classList.toggle("sw-hidden", !visible)
  }

  /** Restore persisted drag position. */
  setPosition(x: number, y: number): void {
    this.root.style.left = `${x}px`
    this.root.style.top = `${y}px`
    this.root.style.right = "unset"
    this.root.style.bottom = "unset"
  }

  setSize(size: WidgetSize, emit = true): void {
    this.currentSize = size
    this.root.dataset.size = size
    if (emit) this.events.onSizeChange(size)
    if (size === "min" && this.panelOpen) this.closePanel()
    this.updateMarquee()
  }

  destroy(): void {
    this.root.remove()
    if (this.idleTimer) clearTimeout(this.idleTimer)
  }

  // ─── DOM builders ───────────────────────────────────────────────────────────

  private buildPill(): void {
    const handle = this.mk("div", "sw-drag-handle")
    handle.setAttribute("aria-hidden", "true")

    const meta = this.mk("div", "sw-meta")
    meta.appendChild(this.moodEl)
    meta.appendChild(this.episodeEl)
    meta.appendChild(this.timestampEl)
    // Sigil: only visible in "full" size
    meta.appendChild(this.sigilEl)
    // Title track (marquee container)
    meta.appendChild(this.titleTrack)

    const controls = this.mk("div", "sw-controls")
    controls.appendChild(this.sizeBtn)

    const pillBody = this.mk("div", "sw-pill-body")
    pillBody.appendChild(handle)
    pillBody.appendChild(meta)
    pillBody.appendChild(controls)

    // Progress bar is a child of pill so it clips to pill border-radius
    this.pill.appendChild(pillBody)
    this.pill.appendChild(this.progressBar)
  }

  private buildPanel(): void {
    const header = this.mk("div", "sw-panel-header")
    const htitle = this.mk("span", "sw-panel-title")
    htitle.textContent = "How are you feeling?"
    const closeBtn = this.mk("button", "sw-close-btn")
    closeBtn.textContent = "✕"
    closeBtn.addEventListener("click", () => this.closePanel())
    header.appendChild(htitle)
    header.appendChild(closeBtn)

    const grid = this.mk("div", "sw-emotion-grid")
    for (const emotion of EMOTIONS) {
      const btn = this.mk("button", "sw-emotion-btn")
      btn.dataset.emotion = emotion.type
      btn.setAttribute("aria-label", emotion.label)
      const emojiSpan = this.mk("span", "sw-emotion-emoji")
      emojiSpan.textContent = emotion.emoji
      const labelSpan = this.mk("span", "sw-emotion-label")
      labelSpan.textContent = emotion.label
      btn.appendChild(emojiSpan)
      btn.appendChild(labelSpan)
      btn.addEventListener("click", () =>
        this.selectEmotion(emotion.type, emotion.hue)
      )
      this.emojiSlots.set(emotion.type, btn)
      grid.appendChild(btn)
    }

    const intensityRow = this.mk("div", "sw-intensity-row")
    const intensityLabel = this.mk("label", "sw-intensity-label")
    intensityLabel.textContent = "Intensity"
    intensityLabel.htmlFor = "sw-intensity-slider"
    this.intensitySlider.id = "sw-intensity-slider"
    intensityRow.appendChild(intensityLabel)
    intensityRow.appendChild(this.intensitySlider)

    const noteRow = this.mk("div", "sw-note-row")
    noteRow.appendChild(this.noteInput)

    const actions = this.mk("div", "sw-actions")
    actions.appendChild(this.captureBtn)

    this.panel.appendChild(header)
    this.panel.appendChild(grid)
    this.panel.appendChild(intensityRow)
    this.panel.appendChild(noteRow)
    this.panel.appendChild(actions)
  }

  // ─── State → DOM ────────────────────────────��───────────────────────────────

  private applyState(): void {
    const {
      dramaTitle,
      episode,
      timestamp,
      progress,
      activeEmotion,
      isPlaying,
    } = this.state

    this.episodeEl.textContent = episode
    this.timestampEl.textContent = timestamp

    if (this.titleInner.textContent !== dramaTitle) {
      this.titleInner.textContent = dramaTitle
      this.updateMarquee()
    }

    // Progress bar: set CSS custom property, CSS handles the fill width
    const pct = Math.max(0, Math.min(1, progress)) * 100
    this.progressBar.style.setProperty("--sw-prog-pct", `${pct.toFixed(2)}%`)

    // Emotion / sigil / accent hue
    const emotion = EMOTIONS.find((e) => e.type === activeEmotion) ?? null
    this.moodEl.textContent = emotion ? emotion.emoji : "⬤"
    this.sigilEl.innerHTML = emotion ? SIGILS[emotion.type] : ""
    if (emotion) {
      this.root.style.setProperty("--sw-accent-hue", String(emotion.hue))
    }

    this.root.classList.toggle("sw-playing", isPlaying)
  }

  // ─── Marquee ────────────────────────────────────────────────────────────────

  private updateMarquee(): void {
    // 1. Force a reset so the browser stops the current animation
    this.titleInner.classList.remove("sw-marquee-scroll")
    this.titleInner.style.removeProperty("--sw-marquee-dist")

    // 2. Double RequestAnimationFrame: Ensures DOM is rendered & measured correctly
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const trackW = this.titleTrack.offsetWidth
        const textW = this.titleInner.scrollWidth

        // Only scroll if text is significantly wider than the track
        if (textW > trackW + 1 && this.currentSize !== "min") {
          const dist = textW - trackW + 20 // Added extra padding for smooth exit
          const dur = Math.max(5, dist / 25) // Slightly slower for readability

          // Set the CSS variables for the animation
          this.titleInner.style.setProperty("--sw-marquee-dist", `-${dist}px`)
          this.titleInner.style.setProperty("--sw-marquee-dur", `${dur}s`)

          // 3. Re-apply the class to trigger the fresh animation
          this.titleInner.classList.add("sw-marquee-scroll")
        }
      })
    })
  }

  // ─── Interactions ───────────────────────────────────────────────────────────

  private bindInteractions(): void {
    this.pill.addEventListener("click", () => {
      if (this.didMove) return
      if (this.currentSize === "min") {
        this.setSize("compact")
        return
      }
      this.panelOpen ? this.closePanel() : this.openPanel()
    })

    this.root.addEventListener("mouseenter", () => this.onEnter())
    this.root.addEventListener("mouseleave", () => this.onLeave())

    const handle = this.pill.querySelector(".sw-drag-handle") as HTMLDivElement
    handle.addEventListener("pointerdown", (e) => this.startDrag(e))
    document.addEventListener("pointermove", (e) => this.onDrag(e))
    document.addEventListener("pointerup", () => this.endDrag())

    // Pause marquee on hover
    this.titleTrack.addEventListener("mouseenter", () =>
      this.titleInner.classList.add("sw-marquee-paused")
    )
    this.titleTrack.addEventListener("mouseleave", () =>
      this.titleInner.classList.remove("sw-marquee-paused")
    )
  }

  private openPanel(): void {
    this.panelOpen = true
    this.panel.classList.add("sw-panel--open")
    this.root.classList.add("sw-has-panel")
    this.resetIdleTimer()
  }

  private closePanel(): void {
    this.panelOpen = false
    this.panel.classList.remove("sw-panel--open")
    this.root.classList.remove("sw-has-panel")
    this.selectedEmotion = null
    this.emojiSlots.forEach((btn) =>
      btn.classList.remove("sw-emotion-btn--selected")
    )
    this.noteInput.value = ""
  }

  private selectEmotion(type: EmotionType, hue: number): void {
    this.selectedEmotion = type
    // Update the internal state so applyState reflects the new emotion
    this.state.activeEmotion = type
    this.root.style.setProperty("--sw-accent-hue", String(hue))
    this.emojiSlots.forEach((btn, key) =>
      btn.classList.toggle("sw-emotion-btn--selected", key === type)
    )
    // Immediately update the mood emoji in the pill
    const emotion = EMOTIONS.find((e) => e.type === type)
    if (emotion) {
      this.moodEl.textContent = emotion.emoji
      this.sigilEl.innerHTML = SIGILS[emotion.type]
      // Trigger the emotion-specific particle effect on selection
      EFFECTS[emotion.type](this.pill)
    }
  }

  private onEnter(): void {
    this.root.classList.add("sw-hovered")
    if (this.idleTimer) clearTimeout(this.idleTimer)
  }

  private onLeave(): void {
    this.root.classList.remove("sw-hovered")
    this.resetIdleTimer()
  }

  private resetIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.root.classList.remove("sw-idle")
    this.idleTimer = setTimeout(() => {
      if (!this.panelOpen) this.root.classList.add("sw-idle")
    }, IDLE_TIMEOUT_MS)
  }

  // ─── Drag ───────────────────────────────────────────────────────────────────

  private startDrag(e: PointerEvent): void {
    e.preventDefault()
    this.didMove = false
    const rect = this.root.getBoundingClientRect()
    this.dragOffsetX = e.clientX - rect.left
    this.dragOffsetY = e.clientY - rect.top
    document.addEventListener(
      "pointermove",
      () => {
        this.dragging = true
        this.didMove = true
        this.root.classList.add("sw-dragging")
      },
      { once: true }
    )
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  private onDrag(e: PointerEvent): void {
    if (!this.dragging) return
    const cx = Math.max(
      0,
      Math.min(
        e.clientX - this.dragOffsetX,
        window.innerWidth - this.root.offsetWidth
      )
    )
    const cy = Math.max(
      0,
      Math.min(
        e.clientY - this.dragOffsetY,
        window.innerHeight - this.root.offsetHeight
      )
    )
    this.root.style.left = `${cx}px`
    this.root.style.top = `${cy}px`
    this.root.style.right = "unset"
    this.root.style.bottom = "unset"
  }

  private endDrag(): void {
    if (!this.dragging) return
    this.dragging = false
    this.root.classList.remove("sw-dragging")
    const rect = this.root.getBoundingClientRect()
    this.events.onDragEnd(rect.left, rect.top)
    setTimeout(() => {
      this.didMove = false
    }, 60)
  }

  // ─── Form elements ──────────────────────────────────────────────────────────

  private createSlider(): HTMLInputElement {
    const el = document.createElement("input")
    el.type = "range"
    el.min = "0"
    el.max = "100"
    el.value = "70"
    el.className = "sw-slider"
    el.addEventListener("input", () => {
      const pct = el.value + "%"
      el.style.background = `linear-gradient(to right,var(--sw-accent) ${pct},hsl(220 18% 100%/0.12) ${pct})`
    })
    return el
  }

  private createNoteInput(): HTMLInputElement {
    const el = document.createElement("input")
    el.type = "text"
    el.placeholder = "Add a note… (optional)"
    el.className = "sw-note-input"
    el.maxLength = 120
    return el
  }

  private createCaptureBtn(): HTMLButtonElement {
    const el = document.createElement("button")
    el.className = "sw-capture-btn"
    el.textContent = "Capture Moment"
    el.addEventListener("click", () => {
      if (!this.selectedEmotion) return
      const intensity = Number(this.intensitySlider.value) / 100
      const note = this.noteInput.value.trim()
      this.events.onEmotionSelect(this.selectedEmotion, intensity, note)
      EFFECTS[this.selectedEmotion](this.pill)
      setTimeout(() => this.closePanel(), 900)
    })
    return el
  }

  private createSizeBtn(): HTMLButtonElement {
    const el = document.createElement("button")
    el.className = "sw-size-btn"
    el.setAttribute("aria-label", "Resize widget")
    el.innerHTML = `<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M1 4V1h3M8 1h3v3M11 8v3H8M4 11H1V8"/>
    </svg>`
    el.addEventListener("click", (e) => {
      e.stopPropagation()
      const idx = SIZE_CYCLE.indexOf(this.currentSize)
      this.setSize(SIZE_CYCLE[(idx + 1) % SIZE_CYCLE.length])
    })
    return el
  }

  // ─── Utility ────────────────────────────────────────────────────────────────

  private mk<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    cls: string
  ): HTMLElementTagNameMap[K] {
    const el = document.createElement(tag)
    el.className = cls
    return el
  }
}
