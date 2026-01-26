import "@/styles/content.css"

import type {
  CapturedMoment,
  DramaContext,
  EmotionConfig,
  EmotionType,
} from "@/types/schema"
import { EMOTIONS } from "@/types/schema"

// === UTILITY FUNCTIONS ===
function getEmotionConfig(type: EmotionType): EmotionConfig {
  return EMOTIONS.find((e) => e.type === type) ?? EMOTIONS[5]
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

// === GLOBAL STATE ===
let state = {
  // Runtime context - collected from page
  dramaTitle: "",
  episode: 0,
  currentTimestamp: 0,

  // UI state
  isExpanded: false,
  showPolling: false,

  // Capture state
  selectedEmotion: null as EmotionType | null,
  intensity: 0.5,
  note: "",
  showNote: false,
  justCaptured: false,

  // Display state
  currentEmotion: "joy" as EmotionType,
  currentRating: 8.0,

  // Data
  capturedMoments: [] as Array<CapturedMoment>,
}

// === DOM REFERENCES ===
let floatingBar: HTMLElement | null = null
let quickCapturePanel: HTMLElement | null = null
// let pollingPrompt: HTMLElement | null = null
let capturedMomentsList: HTMLElement | null = null

// === CONTEXT DETECTION ===
function detectDramaContext(): DramaContext {
  // Mock detection - in real implementation, parse from page title, video player, etc.
  const titleEl = document.querySelector("title")
  const title = titleEl?.textContent || "Unknown Drama"

  // Extract episode from title (common patterns: "Ep 33", "Episode 33", etc.)
  const episodeMatch = title.match(/(?:Ep|Episode)\s*(\d+)/i)
  const episode = episodeMatch ? parseInt(episodeMatch[1], 10) : 1

  // Try to get video timestamp
  const videoEl = document.querySelector("video") as HTMLVideoElement
  const timestamp = videoEl ? Math.floor(videoEl.currentTime) : 0

  return {
    dramaTitle: title.split("-")[0].trim(),
    episode,
    timestamp,
  }
}

function updateContextFromPage() {
  const context = detectDramaContext()
  state.dramaTitle = context.dramaTitle
  state.episode = context.episode
  state.currentTimestamp = context.timestamp
}

// === UI CREATION FUNCTIONS ===
function createFloatingBar(): HTMLElement {
  const div = document.createElement("div")
  div.id = "drama-sentiment-floating-bar"
  div.className = `
    fixed bottom-6 right-6 z-[999999]
    flex items-center gap-3 px-5 py-3
    bg-black/30 backdrop-blur-xl
    border border-white/10
    rounded-full cursor-pointer
    shadow-lg
    transition-all duration-300 ease-out
    hover:-translate-y-0.5 hover:shadow-xl hover:bg-black/40
    active:scale-95
  `
  div.setAttribute("role", "button")
  div.setAttribute("aria-label", "Open sentiment capture panel")

  div.addEventListener("click", handleFloatingBarClick)

  return div
}

function updateFloatingBar() {
  if (!floatingBar) return

  const config = getEmotionConfig(state.currentEmotion)

  // Update glow color
  floatingBar.className = floatingBar.className.replace(
    /shadow-\w+-\d+\/\d+/,
    config.glowColor
  )

  // Update content
  floatingBar.innerHTML = `
    <span class="text-2xl" role="img" aria-label="${config.label}">${config.emoji}</span>
    <span class="text-white/90 font-semibold tabular-nums">${state.currentRating.toFixed(1)}</span>
    <span class="text-white/40">•</span>
    <span class="text-white/70 text-sm">Ep ${state.episode}</span>
    <span class="text-white/40">•</span>
    <span class="text-white/90 font-mono text-sm tabular-nums">${formatTimestamp(state.currentTimestamp)}</span>
  `

  // Hide when expanded
  floatingBar.style.display = state.isExpanded ? "none" : "flex"
}

function createQuickCapturePanel(): HTMLElement {
  const div = document.createElement("div")
  div.id = "drama-sentiment-quick-capture"
  div.className = `
    fixed bottom-6 right-6 z-[999999]
    w-80 overflow-hidden
    bg-black/40 backdrop-blur-xl
    border border-white/10 rounded-2xl
    shadow-2xl shadow-black/50
    transition-all duration-300 ease-out
    opacity-0 translate-y-4 scale-95 pointer-events-none
  `
  div.setAttribute("role", "dialog")
  div.setAttribute("aria-label", "Quick sentiment capture")

  return div
}

function updateQuickCapturePanel() {
  if (!quickCapturePanel) return

  // Toggle visibility
  if (state.isExpanded) {
    quickCapturePanel.className = quickCapturePanel.className.replace(
      "opacity-0 translate-y-4 scale-95 pointer-events-none",
      "opacity-100 translate-y-0 scale-100"
    )
  } else {
    quickCapturePanel.className = quickCapturePanel.className.replace(
      "opacity-100 translate-y-0 scale-100",
      "opacity-0 translate-y-4 scale-95 pointer-events-none"
    )
  }

  // Build content
  const emotionButtons = EMOTIONS.map((emotion) => {
    const isSelected = state.selectedEmotion === emotion.type
    const showPulse = isSelected && state.justCaptured

    return `
      <button
        type="button"
        data-emotion="${emotion.type}"
        class="
          relative flex items-center justify-center
          w-full aspect-square rounded-xl
          text-2xl cursor-pointer
          transition-all duration-200 ease-out
          ${
            isSelected
              ? `bg-gradient-to-br ${emotion.gradient} scale-110`
              : "bg-white/5 hover:bg-white/15 hover:scale-105"
          }
          active:scale-95
        "
        aria-label="Record ${emotion.label} emotion"
      >
        <span class="${showPulse ? "animate-pulse" : ""}">${emotion.emoji}</span>
        ${
          showPulse
            ? `
          <span class="absolute inset-0 flex items-center justify-center">
            <svg class="w-6 h-6 text-green-400 animate-ping" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
            </svg>
          </span>
        `
            : ""
        }
      </button>
    `
  }).join("")

  quickCapturePanel.innerHTML = `
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-white/10">
      <div class="text-white/90 text-sm font-medium truncate pr-2">
        ${state.dramaTitle || "Drama"} - Ep ${state.episode}
      </div>
      <button
        type="button"
        id="close-panel-btn"
        class="text-white/50 hover:text-white/90 transition-colors p-1 -mr-1"
        aria-label="Close panel"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <!-- Timestamp Display -->
    <div class="py-4 text-center border-b border-white/5">
      <span class="text-4xl font-mono text-white/95 tabular-nums tracking-wider">
        ${formatTimestamp(state.currentTimestamp)}
      </span>
    </div>

    <!-- Emoji Buttons -->
    <div class="p-4 border-b border-white/5">
      <div class="text-white/60 text-xs uppercase tracking-wider mb-3">Quick Mood Capture</div>
      <div class="grid grid-cols-6 gap-2">
        ${emotionButtons}
      </div>
    </div>

    <!-- Intensity Slider -->
    <div class="px-4 py-3 border-b border-white/5">
      <div class="flex items-center justify-between mb-2">
        <span class="text-white/60 text-xs uppercase tracking-wider">Intensity</span>
        <span class="text-white/80 text-sm font-mono tabular-nums">${Math.round(state.intensity * 100)}%</span>
      </div>
      <input
        type="range"
        id="intensity-slider"
        min="0"
        max="1"
        step="0.01"
        value="${state.intensity}"
        class="w-full h-2 bg-white/10 rounded-full appearance-none cursor-pointer
          [&::-webkit-slider-thumb]:appearance-none
          [&::-webkit-slider-thumb]:w-4
          [&::-webkit-slider-thumb]:h-4
          [&::-webkit-slider-thumb]:bg-white
          [&::-webkit-slider-thumb]:rounded-full
          [&::-webkit-slider-thumb]:shadow-lg
          [&::-webkit-slider-thumb]:cursor-pointer
          [&::-webkit-slider-thumb]:transition-transform
          [&::-webkit-slider-thumb]:hover:scale-110"
        aria-label="Emotion intensity"
      />
    </div>

    <!-- Optional Note Field -->
    <div class="p-4">
      ${
        !state.showNote
          ? `
        <button
          type="button"
          id="toggle-note-btn"
          class="w-full text-left text-white/50 text-sm hover:text-white/70 transition-colors"
        >
          + Add note (optional)
        </button>
      `
          : `
        <div class="space-y-2">
          <textarea
            id="note-textarea"
            placeholder="What happened in this moment?"
            rows="2"
            class="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg
              text-white/90 text-sm placeholder:text-white/30
              focus:outline-none focus:ring-1 focus:ring-white/30
              resize-none"
            aria-label="Optional note"
          >${state.note}</textarea>
          <button
            type="button"
            id="hide-note-btn"
            class="text-white/40 text-xs hover:text-white/60 transition-colors"
          >
            Hide note
          </button>
        </div>
      `
      }
    </div>
  `

  // Attach event listeners
  quickCapturePanel.querySelectorAll("[data-emotion]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const emotion = (e.currentTarget as HTMLElement).dataset
        .emotion as EmotionType
      handleEmojiClick(emotion)
    })
  })

  const closeBtn = quickCapturePanel.querySelector("#close-panel-btn")
  if (closeBtn) closeBtn.addEventListener("click", handlePanelClose)

  const intensitySlider = quickCapturePanel.querySelector(
    "#intensity-slider"
  ) as HTMLInputElement
  if (intensitySlider) {
    intensitySlider.addEventListener("input", (e) => {
      state.intensity = parseFloat((e.target as HTMLInputElement).value)
      updateQuickCapturePanel()
    })
  }

  const toggleNoteBtn = quickCapturePanel.querySelector("#toggle-note-btn")
  if (toggleNoteBtn) toggleNoteBtn.addEventListener("click", toggleNoteField)

  const hideNoteBtn = quickCapturePanel.querySelector("#hide-note-btn")
  if (hideNoteBtn) hideNoteBtn.addEventListener("click", toggleNoteField)

  const noteTextarea = quickCapturePanel.querySelector(
    "#note-textarea"
  ) as HTMLTextAreaElement
  if (noteTextarea) {
    noteTextarea.addEventListener("input", (e) => {
      state.note = (e.target as HTMLTextAreaElement).value
    })
  }
}

// === EVENT HANDLERS ===
function handleFloatingBarClick() {
  updateContextFromPage() // Refresh context
  state.isExpanded = true
  updateFloatingBar()
  updateQuickCapturePanel()
}

function handlePanelClose() {
  state.isExpanded = false
  updateFloatingBar()
  updateQuickCapturePanel()
}

function handleEmojiClick(emotion: EmotionType) {
  state.selectedEmotion = emotion
  state.justCaptured = true

  // Create captured moment
  const config = getEmotionConfig(emotion)
  const moment: CapturedMoment = {
    id: generateId(),
    timestamp: state.currentTimestamp,
    emotion: emotion,
    intensity: state.intensity,
    emoji: config.emoji,
    note: state.note || undefined,
    episodeId: `ep-${state.episode}`,
    dramaTitle: state.dramaTitle,
    capturedAt: Date.now(),
  }

  state.capturedMoments = [moment, ...state.capturedMoments]
  state.currentEmotion = emotion

  // Update UI immediately
  updateQuickCapturePanel()
  updateCapturedMomentsList()

  // Auto-close after animation
  setTimeout(() => {
    state.justCaptured = false
    state.selectedEmotion = null
    state.note = ""
    state.showNote = false
    updateQuickCapturePanel()
  }, 1500)

  setTimeout(() => {
    state.isExpanded = false
    updateFloatingBar()
    updateQuickCapturePanel()
  }, 1500)
}

function toggleNoteField() {
  state.showNote = !state.showNote
  updateQuickCapturePanel()
}

function updateCapturedMomentsList() {
  if (!capturedMomentsList) return

  if (state.capturedMoments.length === 0) {
    capturedMomentsList.innerHTML = `
      <div class="text-center py-12 text-white/40">
        <div class="text-4xl mb-3">🎬</div>
        <p class="text-sm">No moments captured yet</p>
        <p class="text-xs mt-1">Click the floating bar to start tracking</p>
      </div>
    `
    return
  }

  const momentsList = state.capturedMoments
    .map((moment) => {
      const config = getEmotionConfig(moment.emotion)
      return `
      <div class="
        flex items-center gap-3 p-3
        bg-gradient-to-r ${config.gradient} bg-opacity-10
        border border-white/10 rounded-xl
        animate-in slide-in-from-bottom-2 duration-300
      ">
        <span class="text-2xl">${moment.emoji}</span>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="text-white/90 font-mono text-sm tabular-nums">
              ${formatTimestamp(moment.timestamp)}
            </span>
            <span class="text-white/40 text-xs">•</span>
            <span class="text-white/60 text-xs capitalize">${moment.emotion}</span>
            <span class="text-white/40 text-xs">•</span>
            <span class="text-white/50 text-xs">${Math.round(moment.intensity * 100)}%</span>
          </div>
          ${
            moment.note
              ? `
            <p class="text-white/70 text-xs mt-1 truncate">${moment.note}</p>
          `
              : ""
          }
        </div>
      </div>
    `
    })
    .join("")

  capturedMomentsList.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-white/80 text-sm font-medium">Captured Moments</h3>
      <span class="text-white/40 text-xs">${state.capturedMoments.length} total</span>
    </div>
    <div class="space-y-2 max-h-80 overflow-y-auto pr-1">
      ${momentsList}
    </div>
  `
}

// === INITIALIZATION ===
function init() {
  console.log("[Drama Sentiment] Initializing...")

  // Detect initial context
  updateContextFromPage()

  // Create UI elements
  floatingBar = createFloatingBar()
  quickCapturePanel = createQuickCapturePanel()

  // Append to page
  document.body.appendChild(floatingBar)
  document.body.appendChild(quickCapturePanel)

  // Initial render
  updateFloatingBar()
  updateQuickCapturePanel()

  // Update timestamp periodically
  setInterval(() => {
    const videoEl = document.querySelector("video") as HTMLVideoElement
    if (videoEl) {
      state.currentTimestamp = Math.floor(videoEl.currentTime)
      updateFloatingBar()
    }
  }, 1000)

  console.log("[Drama Sentiment] Initialized", state)
}

// Run on page load
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init)
} else {
  init()
}
