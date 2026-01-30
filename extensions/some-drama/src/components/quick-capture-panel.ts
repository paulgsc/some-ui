// Quick Capture Panel Component
import { EMOTIONS, formatTimestamp } from "@/utils"

import type { EmotionType } from "@/types/schema"

type QuickCapturePanelCallbacks = {
  onClose: () => void
  onEmojiClick: (emotion: EmotionType) => void
  onIntensityChange: (intensity: number) => void
  onNoteChange: (note: string) => void
  onToggleNote: () => void
}

type QuickCapturePanelState = {
  dramaTitle: string
  episode: number
  timestamp: number
  selectedEmotion: EmotionType | null
  intensity: number
  note: string
  showNote: boolean
  justCaptured: boolean
}

export class QuickCapturePanel {
  private element: HTMLElement
  private callbacks: QuickCapturePanelCallbacks

  constructor(callbacks: QuickCapturePanelCallbacks) {
    this.callbacks = callbacks
    this.element = this.create()
  }

  private create(): HTMLElement {
    const div = document.createElement("div")
    div.id = "drama-sentiment-quick-capture"
    div.setAttribute("role", "dialog")
    div.setAttribute("aria-label", "Quick sentiment capture")
    return div
  }

  update(state: QuickCapturePanelState, isVisible: boolean): void {
    // Toggle visibility
    if (isVisible) {
      this.element.classList.add("visible")
    } else {
      this.element.classList.remove("visible")
    }

    // Build emotion buttons
    const emotionButtons = EMOTIONS.map((emotion) => {
      const isSelected = state.selectedEmotion === emotion.type
      const showPulse = isSelected && state.justCaptured

      return `
        <button
          type="button"
          class="emoji-btn ${isSelected ? `selected ${emotion.className}` : ""}"
          data-emotion="${emotion.type}"
          aria-label="Record ${emotion.label} emotion"
        >
          <span class="emoji-icon ${showPulse ? "pulse" : ""}">${emotion.emoji}</span>
          ${
            showPulse
              ? `
            <span class="checkmark">
              <svg fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
              </svg>
            </span>
          `
              : ""
          }
        </button>
      `
    }).join("")

    // Build complete panel HTML
    this.element.innerHTML = `
      <div class="panel-header">
        <div class="panel-title">${state.dramaTitle || "Drama"} - Ep ${state.episode}</div>
        <button type="button" class="close-btn" data-action="close" aria-label="Close panel">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="timestamp-display">
        <span class="timestamp-large">${formatTimestamp(state.timestamp)}</span>
      </div>

      <div class="emoji-section">
        <div class="section-label">Quick Mood Capture</div>
        <div class="emoji-grid">
          ${emotionButtons}
        </div>
      </div>

      <div class="intensity-section">
        <div class="intensity-header">
          <span class="intensity-label">Intensity</span>
          <span class="intensity-value">${Math.round(state.intensity * 100)}%</span>
        </div>
        <input
          type="range"
          class="intensity-slider"
          min="0"
          max="1"
          step="0.01"
          value="${state.intensity}"
          data-action="intensity"
          aria-label="Emotion intensity"
        />
      </div>

      <div class="note-section">
        ${
          !state.showNote
            ? `
          <button type="button" class="note-toggle-btn" data-action="toggle-note">
            + Add note (optional)
          </button>
        `
            : `
          <div class="note-field">
            <textarea
              class="note-textarea"
              placeholder="What happened in this moment?"
              rows="2"
              data-action="note"
              aria-label="Optional note"
            >${state.note}</textarea>
            <button type="button" class="hide-note-btn" data-action="hide-note">
              Hide note
            </button>
          </div>
        `
        }
      </div>
    `

    // Attach event listeners
    this.attachEventListeners()
  }

  private attachEventListeners(): void {
    // Emotion buttons
    this.element.querySelectorAll("[data-emotion]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const emotion = (e.currentTarget as HTMLElement).dataset
          .emotion as EmotionType
        this.callbacks.onEmojiClick(emotion)
      })
    })

    // Close button
    const closeBtn = this.element.querySelector('[data-action="close"]')
    if (closeBtn) {
      closeBtn.addEventListener("click", this.callbacks.onClose)
    }

    // Intensity slider
    const intensitySlider = this.element.querySelector(
      '[data-action="intensity"]'
    ) as HTMLInputElement
    if (intensitySlider) {
      intensitySlider.addEventListener("input", (e) => {
        this.callbacks.onIntensityChange(
          parseFloat((e.target as HTMLInputElement).value)
        )
      })
    }

    // Note textarea
    const noteTextarea = this.element.querySelector(
      '[data-action="note"]'
    ) as HTMLTextAreaElement
    if (noteTextarea) {
      noteTextarea.addEventListener("input", (e) => {
        this.callbacks.onNoteChange((e.target as HTMLTextAreaElement).value)
      })
    }

    // Toggle note buttons
    const toggleNoteBtn = this.element.querySelector(
      '[data-action="toggle-note"]'
    )
    if (toggleNoteBtn) {
      toggleNoteBtn.addEventListener("click", this.callbacks.onToggleNote)
    }

    const hideNoteBtn = this.element.querySelector('[data-action="hide-note"]')
    if (hideNoteBtn) {
      hideNoteBtn.addEventListener("click", this.callbacks.onToggleNote)
    }
  }

  mount(parent: HTMLElement = document.body): void {
    parent.appendChild(this.element)
  }

  unmount(): void {
    this.element.remove()
  }
}
