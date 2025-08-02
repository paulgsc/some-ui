export class Overlay {
  private element: HTMLDivElement
  private isVisible: boolean = true

  constructor() {
    this.element = this.createElement()
    this.appendToBody()
  }

  private createElement(): HTMLDivElement {
    const overlay = document.createElement("div")
    overlay.id = "typing-mirror-overlay"
    overlay.className = "typing-mirror-overlay"
    overlay.innerHTML = "<em>Start typing...</em>"

    // Apply Tailwind styles programmatically
    Object.assign(overlay.style, {
      position: "fixed",
      bottom: "20px",
      right: "20px",
      maxWidth: "300px",
      maxHeight: "200px",
      background: "rgba(0, 0, 0, 0.8)",
      color: "#00ff00",
      fontFamily: '"Courier New", "Monaco", "Consolas", monospace',
      fontSize: "12px",
      padding: "10px",
      borderRadius: "5px",
      border: "1px solid rgba(255, 255, 255, 0.3)",
      zIndex: "999999",
      pointerEvents: "none",
      wordWrap: "break-word",
      overflowY: "auto",
      whiteSpace: "pre-wrap",
      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
      backdropFilter: "blur(2px)",
      display: "none",
      transition: "opacity 0.2s ease-in-out",
      opacity: "0",
    })

    return overlay
  }

  private appendToBody(): void {
    document.body.appendChild(this.element)
  }

  updateContent(text: string): void {
    if (text.trim()) {
      this.element.textContent = text
    } else {
      this.element.innerHTML = "<em>Start typing...</em>"
    }
  }

  show(): void {
    if (!this.isVisible) return

    this.element.style.display = "block"
    // Force reflow
    this.element.offsetHeight
    this.element.style.opacity = "1"
  }

  hide(): void {
    this.element.style.opacity = "0"
    setTimeout(() => {
      this.element.style.display = "none"
    }, 200)
  }

  toggle(): void {
    this.isVisible = !this.isVisible

    if (this.isVisible) {
      this.show()
    } else {
      this.hide()
    }
  }

  setVisibility(visible: boolean): void {
    this.isVisible = visible

    if (visible) {
      this.show()
    } else {
      this.hide()
    }
  }

  destroy(): void {
    if (this.element.parentNode) {
      this.element.parentNode.removeChild(this.element)
    }
  }
}
