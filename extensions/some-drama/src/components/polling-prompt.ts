// Polling Prompt Component
import { formatTimestamp } from "@/utils"

type PollingPromptCallbacks = {
  onRespond: (feeling: string, newRating?: number) => void
  onDismiss: () => void
}

type PollingPromptState = {
  episode: number
  timestamp: number
  currentRating: number
}

const FEELINGS = [
  { label: "Loving it", value: "loving" },
  { label: "Pretty good", value: "good" },
  { label: "Meh", value: "meh" },
  { label: "Skip-worthy", value: "skip" },
]

export class PollingPrompt {
  private element: HTMLElement
  private callbacks: PollingPromptCallbacks

  constructor(callbacks: PollingPromptCallbacks) {
    this.callbacks = callbacks
    this.element = this.create()
  }

  private create(): HTMLElement {
    const div = document.createElement("div")
    div.id = "drama-sentiment-polling-prompt"
    div.setAttribute("role", "dialog")
    div.setAttribute("aria-label", "Periodic sentiment check")
    return div
  }

  update(state: PollingPromptState, isVisible: boolean): void {
    // Toggle visibility
    if (isVisible) {
      this.element.classList.add("visible")
    } else {
      this.element.classList.remove("visible")
    }

    // Build feelings buttons
    const feelingButtons = FEELINGS.map(
      (feeling) => `
      <button
        type="button"
        class="feeling-btn"
        data-feeling="${feeling.value}"
      >
        ${feeling.label}
      </button>
    `
    ).join("")

    // Build complete prompt HTML
    this.element.innerHTML = `
      <div class="polling-header">
        <span>How's Ep ${state.episode} going so far?</span>
        <span>⏱️</span>
        <span class="polling-time">${formatTimestamp(state.timestamp)}</span>
      </div>

      <div class="feelings-label">Overall feeling:</div>
      <div class="feelings-grid">
        ${feelingButtons}
      </div>

      <div class="rating-row">
        <div class="rating-label">
          Couple rating: <span class="rating-current">${state.currentRating.toFixed(1)}</span>
        </div>
        <div class="rating-actions">
          <button type="button" class="rating-btn" data-action="keep">Keep</button>
          <button type="button" class="rating-btn update" data-action="update">Update</button>
        </div>
      </div>

      <button type="button" class="dismiss-btn" data-action="dismiss">
        Skip for now
      </button>
    `

    // Attach event listeners
    this.attachEventListeners(state.currentRating)
  }

  private attachEventListeners(currentRating: number): void {
    // Feeling buttons
    this.element.querySelectorAll("[data-feeling]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const feeling = (e.currentTarget as HTMLElement).dataset.feeling!
        this.callbacks.onRespond(feeling)
      })
    })

    // Keep rating button
    const keepBtn = this.element.querySelector('[data-action="keep"]')
    if (keepBtn) {
      keepBtn.addEventListener("click", () => {
        this.callbacks.onRespond("keep")
      })
    }

    // Update rating button
    const updateBtn = this.element.querySelector('[data-action="update"]')
    if (updateBtn) {
      updateBtn.addEventListener("click", () => {
        this.callbacks.onRespond("update", currentRating + 0.5)
      })
    }

    // Dismiss button
    const dismissBtn = this.element.querySelector('[data-action="dismiss"]')
    if (dismissBtn) {
      dismissBtn.addEventListener("click", this.callbacks.onDismiss)
    }
  }

  mount(parent: HTMLElement = document.body): void {
    parent.appendChild(this.element)
  }

  unmount(): void {
    this.element.remove()
  }
}
