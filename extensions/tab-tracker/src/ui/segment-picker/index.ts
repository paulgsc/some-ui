import { SEGMENT_DISPLAY, SEGMENTS, type Segment } from "@tab/types"

export class SegmentPicker {
  private el: HTMLElement
  private onSelect: (segment: Segment) => void

  constructor(onSelect: (segment: Segment) => void) {
    this.onSelect = onSelect
    this.el = document.createElement("div")
    this.el.className = "__tl2_picker"
    this.render()
  }

  private render(): void {
    const head = document.createElement("div")
    head.className = "__tl2_picker_head"
    head.textContent = "assign segment"
    this.el.appendChild(head)

    const grid = document.createElement("div")
    grid.className = "__tl2_picker_grid"

    for (const seg of SEGMENTS) {
      const cfg = SEGMENT_DISPLAY[seg]

      const btn = document.createElement("button")
      btn.className = "__tl2_seg_btn"
      btn.style.setProperty("--tl-seg-accent", cfg.accent)

      const dot = document.createElement("span")
      dot.className = "__tl2_seg_dot"
      dot.style.background = cfg.accent

      const name = document.createElement("span")
      name.className = "__tl2_seg_name"
      name.textContent = cfg.abbr

      btn.appendChild(dot)
      btn.appendChild(name)
      btn.addEventListener("click", (e) => {
        e.stopPropagation()
        this.onSelect(seg)
      })

      grid.appendChild(btn)
    }

    this.el.appendChild(grid)
  }

  getElement(): HTMLElement {
    return this.el
  }
}
