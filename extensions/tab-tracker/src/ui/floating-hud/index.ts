import type { NodeState, Outcome, Segment } from "@tab/types"
import { SEGMENT_DISPLAY } from "@tab/types"
import { NodePanel } from "@tab/ui/node-panel"
import { SegmentPicker } from "@tab/ui/segment-picker"

export type HUDCallbacks = {
  onSegmentSelect: (segment: Segment) => void
  onOutcomeRegister: (outcome: Outcome) => void
}

type Freshness = "fresh" | "recent" | "stale" | "unknown"

const DRAG_KEY = "__tl2_hud_pos__"
const HUD_ID = "__tl2_hud__"

function computeFreshness(visits: NodeState["visits"]): Freshness {
  if (visits.length === 0) return "unknown"
  const last = Math.max(...visits.map((v) => v.timestamp))
  const diffHr = (Date.now() - last) / 3_600_000
  if (diffHr < 2) return "fresh"
  if (diffHr < 24) return "recent"
  return "stale"
}

export class FloatingHUD {
  private hudEl: HTMLElement
  private chip: HTMLElement
  private pulseDot: HTMLElement
  private chipLabel: HTMLElement
  private chipCount: HTMLElement
  private panel: HTMLElement
  private picker: SegmentPicker
  private nodePanel: NodePanel

  private isOpen = false
  private showingPicker = false

  // drag
  private isDragging = false
  private wasDragged = false
  private dragStartX = 0
  private dragStartY = 0
  private posX = 0
  private posY = 0

  // idle
  private idleTimeout: ReturnType<typeof setTimeout> | null = null

  // current node state cache
  private nodeState: NodeState | null = null
  private activeMs = 0

  private callbacks: HUDCallbacks

  constructor(callbacks: HUDCallbacks) {
    this.callbacks = callbacks

    // ── Root ──────────────────────────────────────────────────────────────────
    this.hudEl = document.createElement("div")
    this.hudEl.id = HUD_ID
    this.hudEl.className = "tl-active"

    // ── Chip ──────────────────────────────────────────────────────────────────
    this.chip = document.createElement("div")
    this.chip.className = "__tl2_chip"
    this.chip.dataset.freshness = "unknown"

    this.pulseDot = document.createElement("div")
    this.pulseDot.className = "__tl2_pulse"

    this.chipLabel = document.createElement("div")
    this.chipLabel.className = "__tl2_chip_label tl-unassigned"
    this.chipLabel.textContent = "—"

    this.chipCount = document.createElement("div")
    this.chipCount.className = "__tl2_chip_count"
    this.chipCount.textContent = "0"

    this.chip.appendChild(this.pulseDot)
    this.chip.appendChild(this.chipLabel)
    this.chip.appendChild(this.chipCount)

    // ── Panel ─────────────────────────────────────────────────────────────────
    this.panel = document.createElement("div")
    this.panel.className = "__tl2_panel"

    this.picker = new SegmentPicker((seg) => {
      this.callbacks.onSegmentSelect(seg)
    })

    this.nodePanel = new NodePanel(
      (outcome) => {
        this.callbacks.onOutcomeRegister(outcome)
      },
      () => {
        // reassign — show picker
        this.showPicker()
      }
    )

    // Start with picker
    this.panel.appendChild(this.picker.getElement())

    // ── Compose ───────────────────────────────────────────────────────────────
    this.hudEl.appendChild(this.chip)
    this.hudEl.appendChild(this.panel)

    this.setupInteractions()
  }

  // ── Interactions ─────────────────────────────────────────────────────────────

  private setupInteractions(): void {
    // Drag
    this.chip.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return
      e.stopPropagation()
      this.startDrag(e)
    })

    // Click to toggle panel
    this.chip.addEventListener("click", (e) => {
      e.stopPropagation()
      if (this.wasDragged) return
      this.togglePanel()
    })

    // Close panel on outside click
    document.addEventListener("mousedown", (e) => {
      if (this.isOpen && !this.hudEl.contains(e.target as Node)) {
        this.closePanel()
      }
    })

    // Idle fade
    const idleEvents = ["mousedown", "scroll", "keydown"] as const
    for (const ev of idleEvents) {
      document.addEventListener(ev, () => this.onUserActivity(), {
        passive: true,
      })
    }
  }

  private onUserActivity(): void {
    this.hudEl.classList.remove("tl-active")
    this.hudEl.classList.add("tl-idle")
    if (this.idleTimeout) clearTimeout(this.idleTimeout)
    this.idleTimeout = setTimeout(() => {
      this.hudEl.classList.remove("tl-idle")
      this.hudEl.classList.add("tl-active")
    }, 4000)
  }

  // ── Drag ─────────────────────────────────────────────────────────────────────

  private startDrag(e: MouseEvent): void {
    this.isDragging = true
    this.wasDragged = false
    this.dragStartX = e.clientX - this.posX
    this.dragStartY = e.clientY - this.posY

    const onMove = (me: MouseEvent): void => {
      if (!this.isDragging) return
      const nx = me.clientX - this.dragStartX
      const ny = me.clientY - this.dragStartY
      if (Math.abs(nx - this.posX) > 3 || Math.abs(ny - this.posY) > 3) {
        this.wasDragged = true
      }
      this.posX = nx
      this.posY = ny
      this.applyPosition()
    }

    const onUp = (): void => {
      this.isDragging = false
      this.saveDragPosition()
      document.removeEventListener("mousemove", onMove)
      document.removeEventListener("mouseup", onUp)
    }

    document.addEventListener("mousemove", onMove)
    document.addEventListener("mouseup", onUp)
  }

  private applyPosition(): void {
    this.hudEl.style.transform = `translate(${this.posX}px, ${this.posY}px)`
  }

  private saveDragPosition(): void {
    try {
      sessionStorage.setItem(
        DRAG_KEY,
        JSON.stringify({ x: this.posX, y: this.posY })
      )
    } catch {
      // sessionStorage can throw (quota, private mode); position is non-critical.
    }
  }

  private restoreDragPosition(): void {
    try {
      const raw = sessionStorage.getItem(DRAG_KEY)
      if (raw) {
        const { x, y } = JSON.parse(raw) as { x: number; y: number }
        this.posX = x
        this.posY = y
        this.applyPosition()
      }
    } catch {
      // Unreadable/corrupt stored position — fall back to the default.
    }
  }

  // ── Panel ─────────────────────────────────────────────────────────────────────

  private togglePanel(): void {
    if (this.isOpen) {
      this.closePanel()
    } else {
      this.openPanel()
    }
  }

  private openPanel(): void {
    this.isOpen = true

    // Decide which view to show
    if (!this.nodeState || this.nodeState.segment === null) {
      this.showPicker()
    } else {
      this.showNodePanel()
    }

    this.panel.classList.add("tl-open")
  }

  private closePanel(): void {
    this.isOpen = false
    this.panel.classList.remove("tl-open")
  }

  private showPicker(): void {
    this.showingPicker = true
    this.panel.innerHTML = ""
    this.panel.appendChild(this.picker.getElement())
  }

  private showNodePanel(): void {
    this.showingPicker = false
    if (!this.nodeState) return
    this.panel.innerHTML = ""
    this.nodePanel.render({
      nodeState: this.nodeState,
      activeMs: this.activeMs,
    })
    this.panel.appendChild(this.nodePanel.getElement())
  }

  // ── Public update API ─────────────────────────────────────────────────────────

  updateNode(nodeState: NodeState, activeMs: number): void {
    this.nodeState = nodeState
    this.activeMs = activeMs

    const seg = nodeState.segment
    const visits = nodeState.visits

    // Update segment accent on root
    if (seg) {
      this.hudEl.dataset.segment = seg
      const cfg = SEGMENT_DISPLAY[seg]
      this.chipLabel.textContent = cfg.abbr
      this.chipLabel.classList.remove("tl-unassigned")
    } else {
      delete this.hudEl.dataset.segment
      this.chipLabel.textContent = "—"
      this.chipLabel.classList.add("tl-unassigned")
    }

    // Visit count
    this.chipCount.textContent = String(visits.length)
    if (visits.length > 0) {
      this.chipCount.classList.add("tl-has-visits")
    }

    // Freshness
    this.chip.dataset.freshness = computeFreshness(visits)

    // If panel is open and showing node panel, update in place
    if (this.isOpen && !this.showingPicker && seg) {
      this.nodePanel.updateGate(activeMs)
      this.nodePanel.updateVisits(visits)
    }

    // If panel is open and we just got a segment assigned, switch to node panel
    if (this.isOpen && this.showingPicker && seg) {
      this.showNodePanel()
    }
  }

  // Called by content.ts after a successful register
  onRegisterSuccess(outcome: Outcome): void {
    this.nodePanel.showSuccess(outcome)
  }

  // Called by content.ts after a failed register
  onRegisterError(msg: string): void {
    this.nodePanel.showError(msg)
  }

  mount(container: HTMLElement): void {
    container.appendChild(this.hudEl)
    this.restoreDragPosition()
  }

  unmount(): void {
    this.hudEl.remove()
  }

  getElement(): HTMLElement {
    return this.hudEl
  }
}
