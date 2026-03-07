import type { BadgeTier, TabRecord } from "@tab/types"
import { formatMs, formatMsShort, getBadgeTier } from "@tab/types"
import type { ContextPanelData } from "@tab/ui/context-panel"
import { ContextPanel } from "@tab/ui/context-panel"
import { Dot } from "@tab/ui/dot"
import { NeglectLabel } from "@tab/ui/neglect-label"
import { SessionLabel } from "@tab/ui/session-label"
import { Timer } from "@tab/ui/timer"

export type HUDUpdatePayload = {
  record: TabRecord
  elapsed: number
  sessionElapsed: number
  neglect: string | null
  tags: Array<string>
}

const HUD_ID = "__tabledger_hud__"
const DRAG_STORAGE_KEY = "__tl_hud_pos__"

export class FloatingHUD {
  private hudEl: HTMLElement
  private chip: HTMLElement
  private dot: Dot
  private timer: Timer
  private session: SessionLabel
  private neglect: NeglectLabel
  private contextPanel: ContextPanel

  // drag state
  private isDragging = false
  private dragStartX = 0
  private dragStartY = 0
  private posX = 0
  private posY = 0
  private wasDragged = false

  // idle state
  private idleTimeout: ReturnType<typeof setTimeout> | null = null

  // fullscreen
  private isFullscreen = false

  // last known data for context panel refresh
  private lastPayload: HUDUpdatePayload | null = null
  private lastTier: BadgeTier = "green"

  constructor() {
    this.hudEl = document.createElement("div")
    this.hudEl.id = HUD_ID
    this.hudEl.className = "__tl_hud active"

    this.chip = document.createElement("div")
    this.chip.className = "__tl_chip"

    const mainRow = document.createElement("div")
    mainRow.className = "__tl_row"

    this.dot = new Dot({ tier: "green", pulsing: true })
    this.timer = new Timer()

    mainRow.appendChild(this.dot.getElement())
    mainRow.appendChild(this.timer.getElement())

    this.session = new SessionLabel()
    this.neglect = new NeglectLabel()

    this.contextPanel = new ContextPanel(() => {
      this.chip.classList.remove("expanded")
    })

    this.chip.appendChild(mainRow)
    this.chip.appendChild(this.session.getElement())
    this.chip.appendChild(this.neglect.getElement())

    this.hudEl.appendChild(this.chip)
    this.hudEl.appendChild(this.contextPanel.getElement())

    this.setupInteractions()
  }

  private setupInteractions(): void {
    // Click to toggle context panel (only if not dragged)
    this.chip.addEventListener("mousedown", (e) => {
      e.stopPropagation()
      this.onMouseDown(e)
    })

    this.chip.addEventListener("click", (e) => {
      e.stopPropagation()
      if (this.wasDragged) return

      const displayData: ContextPanelData = this.lastPayload
        ? {
            record: this.lastPayload.record,
            elapsed: this.lastPayload.elapsed,
            sessionElapsed: this.lastPayload.sessionElapsed,
            tags: this.lastPayload.tags,
            tier: this.lastTier,
          }
        : {
            record: {
              tabId: -1,
              title: document.title,
              url: location.href,
              favicon: "",
              isActive: true,
              buckets: [],
              totalMs: 0,
              sessionMs: 0,
              lastActivated: Date.now(),
              intentional: false,
              bucketStart: Date.now(),
            },
            tier: "green",
            elapsed: 0,
            sessionElapsed: 0,
            tags: ["connecting..."],
          }

      this.chip.classList.toggle("expanded")
      this.contextPanel.toggle(displayData)
    })

    // Idle detection — fade when user is active
    const events = ["mousedown", "scroll", "keydown"] as const
    for (const evt of events) {
      document.addEventListener(evt, () => this.onUserActivity(), {
        passive: true,
      })
    }

    // Fullscreen detection
    const handleFullscreen = (): void => {
      const fsEl =
        document.fullscreenElement ?? document.webkitFullscreenElement
      this.isFullscreen = !!fsEl
      this.hudEl.style.opacity = this.isFullscreen ? "0" : ""
      this.hudEl.style.pointerEvents = this.isFullscreen ? "none" : ""
    }

    document.addEventListener("fullscreenchange", handleFullscreen)
    document.addEventListener("webkitfullscreenchange", handleFullscreen)
  }

  private onMouseDown(e: MouseEvent): void {
    this.isDragging = true
    this.wasDragged = false
    this.dragStartX = e.clientX - this.posX
    this.dragStartY = e.clientY - this.posY

    const onMove = (moveEvent: MouseEvent): void => {
      if (!this.isDragging) return
      const dx = moveEvent.clientX - this.dragStartX
      const dy = moveEvent.clientY - this.dragStartY

      if (Math.abs(dx - this.posX) > 3 || Math.abs(dy - this.posY) > 3) {
        this.wasDragged = true
      }

      this.posX = dx
      this.posY = dy
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
        DRAG_STORAGE_KEY,
        JSON.stringify({ x: this.posX, y: this.posY })
      )
    } catch {
      /* ignore storage errors */
    }
  }

  private restoreDragPosition(): void {
    try {
      const raw = sessionStorage.getItem(DRAG_STORAGE_KEY)
      if (raw) {
        const { x, y } = JSON.parse(raw)
        this.posX = x
        this.posY = y
        this.applyPosition()
      }
    } catch {
      /* ignore storage errors */
    }
  }

  private onUserActivity(): void {
    this.hudEl.classList.remove("active")
    this.hudEl.classList.add("idle")

    if (this.idleTimeout) clearTimeout(this.idleTimeout)
    this.idleTimeout = setTimeout(() => {
      this.hudEl.classList.remove("idle")
      this.hudEl.classList.add("active")
    }, 3000)
  }

  update(payload: HUDUpdatePayload): void {
    this.lastPayload = payload
    const { record, elapsed, sessionElapsed, neglect, tags } = payload
    const tier = getBadgeTier(elapsed)
    this.lastTier = tier

    this.dot.update(tier, record.isActive)
    this.timer.update(formatMs(elapsed), tier)
    this.neglect.update(neglect)

    if (!this.session.getIsFlashing()) {
      this.session.update(
        sessionElapsed > 60_000
          ? `session ${formatMsShort(sessionElapsed)}`
          : ""
      )
    }

    // refresh open panel
    if (this.contextPanel.getIsOpen()) {
      this.contextPanel.update({ record, tier, elapsed, sessionElapsed, tags })
    }
  }

  flashSession(sessionElapsed: number): void {
    this.session.flash(`today  ${formatMsShort(sessionElapsed)}`)
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
