
export class NeglectLabel {
  private el: HTMLElement

  constructor() {
    this.el = document.createElement("div")
    this.el.className = "__tl_neglect"
    this.el.style.display = "none"
  }

  update(neglect: string | null): void {
    if (neglect) {
      this.el.style.display = "block"
      this.el.textContent = `↑ ${neglect} neglected`
    } else {
      this.el.style.display = "none"
    }
  }

  getElement(): HTMLElement {
    return this.el
  }
}
