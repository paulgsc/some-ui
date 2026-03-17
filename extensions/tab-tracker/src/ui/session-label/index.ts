
const FLASH_DURATION = 3000

export class SessionLabel {
  private el: HTMLElement
  private isFlashing = false
  private flashTimeout: ReturnType<typeof setTimeout> | null = null

  constructor() {
    this.el = document.createElement("div")
    this.el.className = "__tl_session"
  }

  update(text: string): void {
    if (!this.isFlashing) {
      this.el.textContent = text
    }
  }

  flash(text: string): void {
    this.isFlashing = true
    this.el.className = "__tl_session flash"
    this.el.textContent = text

    if (this.flashTimeout) clearTimeout(this.flashTimeout)
    this.flashTimeout = setTimeout(() => {
      this.isFlashing = false
      this.el.className = "__tl_session"
    }, FLASH_DURATION)
  }

  getIsFlashing(): boolean {
    return this.isFlashing
  }

  getElement(): HTMLElement {
    return this.el
  }
}
