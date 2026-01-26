// Main Content Script - Orchestrates all UI components
import "@/styles/content.css"

import { generateId, getEmotionConfig } from "@/utils"

import type { CapturedMoment, EmotionType, UIState } from "@/types/schema"
import { CapturedMomentsList } from "@/components/captured-moments"
import { FloatingBar } from "@/components/floating-bar"
import { PollingPrompt } from "@/components/polling-prompt"
import { QuickCapturePanel } from "@/components/quick-capture-panel"

import { ContextDetector } from "./context-detector"

class DramaSentimentApp {
  private state: UIState
  private contextDetector: ContextDetector

  // UI Components
  private floatingBar: FloatingBar
  private quickCapturePanel: QuickCapturePanel
  private capturedMomentsList: CapturedMomentsList
  private pollingPrompt: PollingPrompt

  // Timers
  private timestampUpdateInterval: number | null = null

  constructor() {
    this.contextDetector = new ContextDetector()

    // Initialize state
    const initialContext = this.contextDetector.detectContext()
    this.state = {
      dramaTitle: initialContext.dramaTitle,
      episode: initialContext.episode,
      currentTimestamp: initialContext.timestamp,

      isExpanded: false,
      showPolling: false,

      selectedEmotion: null,
      intensity: 0.5,
      note: "",
      showNote: false,
      justCaptured: false,

      currentEmotion: "joy",
      currentRating: 8.0,

      capturedMoments: [],
    }

    // Initialize UI components
    this.floatingBar = new FloatingBar(() => this.handleFloatingBarClick())

    this.quickCapturePanel = new QuickCapturePanel({
      onClose: () => this.handlePanelClose(),
      onEmojiClick: (emotion) => this.handleEmojiClick(emotion),
      onIntensityChange: (intensity) => this.handleIntensityChange(intensity),
      onNoteChange: (note) => this.handleNoteChange(note),
      onToggleNote: () => this.handleToggleNote(),
    })

    this.capturedMomentsList = new CapturedMomentsList()

    this.pollingPrompt = new PollingPrompt({
      onRespond: (feeling, newRating) =>
        this.handlePollingRespond(feeling, newRating),
      onDismiss: () => this.handlePollingDismiss(),
    })
  }

  // Event Handlers
  private handleFloatingBarClick(): void {
    // Refresh context from page
    const context = this.contextDetector.detectContext()
    this.state.dramaTitle = context.dramaTitle
    this.state.episode = context.episode
    this.state.currentTimestamp = context.timestamp

    this.state.isExpanded = true
    this.render()
  }

  private handlePanelClose(): void {
    this.state.isExpanded = false
    this.render()
  }

  private handleEmojiClick(emotion: EmotionType): void {
    this.state.selectedEmotion = emotion
    this.state.justCaptured = true

    // Create captured moment
    const config = getEmotionConfig(emotion)
    const moment: CapturedMoment = {
      id: generateId(),
      timestamp: this.state.currentTimestamp,
      emotion: emotion,
      intensity: this.state.intensity,
      emoji: config.emoji,
      note: this.state.note || undefined,
      episodeId: `ep-${this.state.episode}`,
      dramaTitle: this.state.dramaTitle,
      capturedAt: Date.now(),
    }

    // Add to state
    this.state.capturedMoments = [moment, ...this.state.capturedMoments]
    this.state.currentEmotion = emotion

    // Save to storage
    this.saveMoment(moment)

    // Update UI
    this.render()

    // Auto-close after animation
    setTimeout(() => {
      this.state.justCaptured = false
      this.state.selectedEmotion = null
      this.state.note = ""
      this.state.showNote = false
      this.render()
    }, 1500)

    setTimeout(() => {
      this.state.isExpanded = false
      this.render()
    }, 1500)
  }

  private handleIntensityChange(intensity: number): void {
    this.state.intensity = intensity
    this.render()
  }

  private handleNoteChange(note: string): void {
    this.state.note = note
  }

  private handleToggleNote(): void {
    this.state.showNote = !this.state.showNote
    this.render()
  }

  private handlePollingRespond(feeling: string, newRating?: number): void {
    if (newRating !== undefined) {
      this.state.currentRating = Math.min(10, newRating)
    }
    this.state.showPolling = false
    this.render()

    console.log("[Drama Sentiment] Polling response:", feeling, newRating)
  }

  private handlePollingDismiss(): void {
    this.state.showPolling = false
    this.render()
  }

  // Storage
  private saveMoment(moment: CapturedMoment): void {
    browser.runtime
      .sendMessage({
        type: "SAVE_MOMENT",
        moment,
      })
      .then(() => {
        console.log("[Drama Sentiment] Moment saved:", moment.id)
      })
      .catch((err) => {
        console.error("[Drama Sentiment] Failed to save moment:", err)
      })
  }

  // Rendering
  private render(): void {
    // Update floating bar
    this.floatingBar.update(
      this.state.currentEmotion,
      this.state.currentRating,
      this.state.episode,
      this.state.currentTimestamp,
      this.state.isExpanded
    )

    // Update quick capture panel
    this.quickCapturePanel.update(
      {
        dramaTitle: this.state.dramaTitle,
        episode: this.state.episode,
        timestamp: this.state.currentTimestamp,
        selectedEmotion: this.state.selectedEmotion,
        intensity: this.state.intensity,
        note: this.state.note,
        showNote: this.state.showNote,
        justCaptured: this.state.justCaptured,
      },
      this.state.isExpanded
    )

    // Update captured moments list
    this.capturedMomentsList.update(this.state.capturedMoments)

    // Update polling prompt
    this.pollingPrompt.update(
      {
        episode: this.state.episode,
        timestamp: this.state.currentTimestamp,
        currentRating: this.state.currentRating,
      },
      this.state.showPolling
    )
  }

  // Lifecycle
  init(): void {
    console.log("[Drama Sentiment] Initializing...", this.state)

    // Mount UI components
    this.floatingBar.mount()
    this.quickCapturePanel.mount()
    this.capturedMomentsList.mount()
    this.pollingPrompt.mount()

    // Initial render
    this.render()

    // Start timestamp tracking
    this.startTimestampTracking()

    console.log("[Drama Sentiment] Initialized")
  }

  private startTimestampTracking(): void {
    this.timestampUpdateInterval = window.setInterval(() => {
      const videoEl = this.contextDetector.getVideoElement()
      if (videoEl && !isNaN(videoEl.currentTime)) {
        this.state.currentTimestamp = Math.floor(videoEl.currentTime)

        // Only update floating bar if not expanded (to avoid re-renders)
        if (!this.state.isExpanded) {
          this.floatingBar.update(
            this.state.currentEmotion,
            this.state.currentRating,
            this.state.episode,
            this.state.currentTimestamp,
            this.state.isExpanded
          )
        }
      }
    }, 1000)
  }

  destroy(): void {
    if (this.timestampUpdateInterval) {
      clearInterval(this.timestampUpdateInterval)
    }

    this.floatingBar.unmount()
    this.quickCapturePanel.unmount()
    this.capturedMomentsList.unmount()
    this.pollingPrompt.unmount()
  }
}

// Initialize app when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    const app = new DramaSentimentApp()
    app.init()
  })
} else {
  const app = new DramaSentimentApp()
  app.init()
}

// Make app available globally for debugging
declare global {
  interface Window {
    dramaSentimentApp?: DramaSentimentApp
  }
}
