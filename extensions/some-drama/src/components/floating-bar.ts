import { formatTimestamp, getEmotionConfig } from "@/utils"

import type { EmotionType } from "@/types/schema"

export class FloatingBar {
  private element: HTMLElement
  private onClick: () => void

  constructor(onClick: () => void) {
    this.onClick = onClick
    this.element = this.create()
  }

  private create(): HTMLElement {
    const div = document.createElement("div")
    div.id = "drama-sentiment-floating-bar"
    div.setAttribute("role", "button")
    div.setAttribute("aria-label", "Open sentiment capture panel")
    div.addEventListener("click", this.onClick)
    return div
  }

  update(
    emotion: EmotionType,
    rating: number,
    episode: number,
    timestamp: number,
    isExpanded: boolean
  ): void {
    const config = getEmotionConfig(emotion)

    // Toggle visibility based on expanded state
    if (isExpanded) {
      this.element.classList.add("hidden")
    } else {
      this.element.classList.remove("hidden")
    }

    // Update content
    this.element.innerHTML = `
      <span class="emoji" role="img" aria-label="${config.label}">${config.emoji}</span>
      <span class="rating">${rating.toFixed(1)}</span>
      <span class="separator">•</span>
      <span class="episode">Ep ${episode}</span>
      <span class="separator">•</span>
      <span class="timestamp">${formatTimestamp(timestamp)}</span>
    `
  }

  mount(parent: HTMLElement = document.body): void {
    parent.appendChild(this.element)
  }

  unmount(): void {
    this.element.remove()
  }
}
