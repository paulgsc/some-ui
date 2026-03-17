
const TOAST_ID = "__tabledger_toast__"
const TOAST_VISIBLE_DURATION = 4000

export class Toast {
  private el: HTMLElement
  private textEl: HTMLElement
  private innerEl: HTMLElement
  private hideTimeout: ReturnType<typeof setTimeout> | null = null

  constructor() {
    this.el = document.createElement("div")
    this.el.id = TOAST_ID

    this.innerEl = document.createElement("div")
    this.innerEl.className = "__tl_toast_inner"

    const icon = document.createElement("span")
    icon.className = "__tl_toast_icon"
    icon.textContent = "⏱"

    this.textEl = document.createElement("span")
    this.textEl.className = "__tl_toast_text"

    this.innerEl.appendChild(icon)
    this.innerEl.appendChild(this.textEl)
    this.el.appendChild(this.innerEl)
  }

  mount(container: HTMLElement): void {
    container.appendChild(this.el)
  }

  show(text: string, color: string): void {
    this.textEl.textContent = text
    this.innerEl.style.borderLeftColor = color

    if (this.hideTimeout) clearTimeout(this.hideTimeout)
    this.el.classList.add("visible")

    this.hideTimeout = setTimeout(() => {
      this.el.classList.remove("visible")
    }, TOAST_VISIBLE_DURATION)
  }

  getElement(): HTMLElement {
    return this.el
  }
}
