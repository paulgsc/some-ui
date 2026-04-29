
import type { NodeState, Outcome, Segment } from "@tab/types"
import {
  MIN_ACTIVE_MS_TO_REGISTER,
  OUTCOMES,
  OUTCOME_CONFIG,
  SEGMENT_DISPLAY,
} from "@tab/types"

export type RegisterCallback = (outcome: Outcome) => void
export type ReassignCallback = () => void

type NodePanelState = {
  nodeState: NodeState
  activeMs: number
}

export class NodePanel {
  private el: HTMLElement
  private onRegister: RegisterCallback
  private onReassign: ReassignCallback

  // child refs for live updates
  private visitCountEl: HTMLElement | null = null
  private lastSeenEl: HTMLElement | null = null
  private gateFillEl: HTMLElement | null = null
  private gateLabelEl: HTMLElement | null = null
  private outcomeBtns: HTMLElement[] = []
  private outcomeBarFills: Record<Outcome, HTMLElement | null> = {
    Progress: null,
    Stuck: null,
    Review: null,
  }
  private outcomeCountEls: Record<Outcome, HTMLElement | null> = {
    Progress: null,
    Stuck: null,
    Review: null,
  }
  private errorEl: HTMLElement | null = null
  private successEl: HTMLElement | null = null
  private successTimeout: ReturnType<typeof setTimeout> | null = null

  constructor(onRegister: RegisterCallback, onReassign: ReassignCallback) {
    this.onRegister = onRegister
    this.onReassign = onReassign
    this.el = document.createElement("div")
    this.el.className = "__tl2_node"
  }

  render(state: NodePanelState): void {
    this.el.innerHTML = ""
    this.visitCountEl = null
    this.lastSeenEl = null
    this.gateFillEl = null
    this.gateLabelEl = null
    this.outcomeBtns = []
    this.errorEl = null
    this.successEl = null

    const { nodeState, activeMs } = state
    const seg = nodeState.segment as Segment
    const cfg = SEGMENT_DISPLAY[seg]

    // ── Header ──────────────────────────────────────────────────────────────
    const head = document.createElement("div")
    head.className = "__tl2_node_head"

    const segBlock = document.createElement("div")
    segBlock.className = "__tl2_node_seg"

    const segLabel = document.createElement("div")
    segLabel.className = "__tl2_node_seg_label"
    segLabel.textContent = "segment"

    const segValue = document.createElement("div")
    segValue.className = "__tl2_node_seg_value"
    segValue.textContent = cfg.abbr

    segBlock.appendChild(segLabel)
    segBlock.appendChild(segValue)

    const reassignBtn = document.createElement("button")
    reassignBtn.className = "__tl2_node_reassign"
    reassignBtn.textContent = "reassign →"
    reassignBtn.addEventListener("click", (e) => {
      e.stopPropagation()
      this.onReassign()
    })

    head.appendChild(segBlock)
    head.appendChild(reassignBtn)
    this.el.appendChild(head)

    // ── Stats ────────────────────────────────────────────────────────────────
    const div1 = document.createElement("div")
    div1.className = "__tl2_divider"
    this.el.appendChild(div1)

    const stats = document.createElement("div")
    stats.className = "__tl2_stats"

    // Visit count
    const visitStat = this.makeStat(
      String(nodeState.visits.length),
      "visits"
    )
    this.visitCountEl = visitStat.valEl
    stats.appendChild(visitStat.el)

    // Last seen
    const lastSeenStat = this.makeStat(
      this.formatLastSeen(nodeState.visits),
      "last visit"
    )
    this.lastSeenEl = lastSeenStat.valEl
    stats.appendChild(lastSeenStat.el)

    this.el.appendChild(stats)

    // ── Outcome distribution ─────────────────────────────────────────────────
    const counts = this.countOutcomes(nodeState.visits)
    const total = nodeState.visits.length || 1

    const outcomeSection = document.createElement("div")
    outcomeSection.className = "__tl2_outcomes"

    for (const outcome of OUTCOMES) {
      const cfg2 = OUTCOME_CONFIG[outcome]
      const row = document.createElement("div")
      row.className = "__tl2_outcome_row"

      const sym = document.createElement("span")
      sym.className = "__tl2_outcome_sym"
      sym.style.color = cfg2.color
      sym.textContent = cfg2.symbol

      const track = document.createElement("div")
      track.className = "__tl2_outcome_bar_track"

      const fill = document.createElement("div")
      fill.className = "__tl2_outcome_bar_fill"
      fill.style.background = cfg2.color
      fill.style.width = `${Math.round((counts[outcome] / total) * 100)}%`
      this.outcomeBarFills[outcome] = fill

      track.appendChild(fill)

      const count = document.createElement("span")
      count.className = "__tl2_outcome_count"
      count.textContent = String(counts[outcome])
      this.outcomeCountEls[outcome] = count

      row.appendChild(sym)
      row.appendChild(track)
      row.appendChild(count)
      outcomeSection.appendChild(row)
    }

    this.el.appendChild(outcomeSection)

    // ── Error state ──────────────────────────────────────────────────────────
    if (nodeState.lastPostError) {
      const errEl = document.createElement("div")
      errEl.className = "__tl2_error"
      const errLabel = document.createElement("span")
      errLabel.className = "__tl2_error_label"
      errLabel.textContent = "post failed"
      errEl.appendChild(errLabel)
      errEl.appendChild(document.createTextNode(nodeState.lastPostError))
      this.el.appendChild(errEl)
      this.errorEl = errEl
    }

    // ── Register section ─────────────────────────────────────────────────────
    const div2 = document.createElement("div")
    div2.className = "__tl2_divider"
    this.el.appendChild(div2)

    const registerSection = document.createElement("div")
    registerSection.className = "__tl2_register"

    // Gate progress bar
    const gatePct = Math.min(
      100,
      Math.round((activeMs / MIN_ACTIVE_MS_TO_REGISTER) * 100)
    )
    const isUnlocked = activeMs >= MIN_ACTIVE_MS_TO_REGISTER

    const gateTrack = document.createElement("div")
    gateTrack.className = "__tl2_gate_bar_track"

    const gateFill = document.createElement("div")
    gateFill.className = "__tl2_gate_bar_fill"
    gateFill.style.width = `${gatePct}%`
    this.gateFillEl = gateFill
    gateTrack.appendChild(gateFill)

    const gateLabel = document.createElement("div")
    gateLabel.className = "__tl2_gate_label"
    gateLabel.textContent = isUnlocked
      ? "record session outcome"
      : this.gateText(activeMs)
    this.gateLabelEl = gateLabel

    registerSection.appendChild(gateTrack)
    registerSection.appendChild(gateLabel)

    // Outcome buttons
    const btnGrid = document.createElement("div")
    btnGrid.className = "__tl2_outcome_btns"

    const btnClasses: Record<Outcome, string> = {
      Progress: "__tl2_btn_progress",
      Stuck: "__tl2_btn_stuck",
      Review: "__tl2_btn_review",
    }

    for (const outcome of OUTCOMES) {
      const cfg2 = OUTCOME_CONFIG[outcome]
      const btn = document.createElement("button")
      btn.className = `__tl2_outcome_btn ${btnClasses[outcome]}`
      btn.disabled = !isUnlocked

      const sym = document.createElement("span")
      sym.className = "__tl2_btn_sym"
      sym.textContent = cfg2.symbol

      const label = document.createElement("span")
      label.className = "__tl2_btn_label"
      label.textContent = outcome

      btn.appendChild(sym)
      btn.appendChild(label)
      btn.addEventListener("click", (e) => {
        e.stopPropagation()
        if (!btn.disabled) this.onRegister(outcome)
      })

      this.outcomeBtns.push(btn)
      btnGrid.appendChild(btn)
    }

    registerSection.appendChild(btnGrid)
    this.el.appendChild(registerSection)
  }

  // ── Live update (without full re-render) ────────────────────────────────────

  updateGate(activeMs: number): void {
    const gatePct = Math.min(
      100,
      Math.round((activeMs / MIN_ACTIVE_MS_TO_REGISTER) * 100)
    )
    const isUnlocked = activeMs >= MIN_ACTIVE_MS_TO_REGISTER

    if (this.gateFillEl) this.gateFillEl.style.width = `${gatePct}%`
    if (this.gateLabelEl) {
      this.gateLabelEl.textContent = isUnlocked
        ? "record session outcome"
        : this.gateText(activeMs)
    }
    for (const btn of this.outcomeBtns) {
      ;(btn as HTMLButtonElement).disabled = !isUnlocked
    }
  }

  updateVisits(visits: NodeState["visits"]): void {
    const counts = this.countOutcomes(visits)
    const total = visits.length || 1

    if (this.visitCountEl) {
      this.visitCountEl.textContent = String(visits.length)
    }
    if (this.lastSeenEl) {
      this.lastSeenEl.textContent = this.formatLastSeen(visits)
    }
    for (const outcome of OUTCOMES) {
      const fill = this.outcomeBarFills[outcome]
      const count = this.outcomeCountEls[outcome]
      if (fill) {
        fill.style.width = `${Math.round((counts[outcome] / total) * 100)}%`
      }
      if (count) count.textContent = String(counts[outcome])
    }
  }

  showSuccess(outcome: Outcome): void {
    if (this.successTimeout) clearTimeout(this.successTimeout)

    // Remove old success
    this.successEl?.remove()

    const el = document.createElement("div")
    el.className = "__tl2_success"
    const sym = OUTCOME_CONFIG[outcome].symbol
    el.textContent = `${sym} ${outcome} recorded`
    this.el.insertBefore(el, this.el.lastElementChild)
    this.successEl = el

    this.successTimeout = setTimeout(() => {
      el.remove()
      this.successEl = null
    }, 3200)
  }

  showError(msg: string): void {
    if (this.errorEl) {
      this.errorEl.textContent = ""
      const errLabel = document.createElement("span")
      errLabel.className = "__tl2_error_label"
      errLabel.textContent = "post failed"
      this.errorEl.appendChild(errLabel)
      this.errorEl.appendChild(document.createTextNode(msg))
      return
    }
    const errEl = document.createElement("div")
    errEl.className = "__tl2_error"
    const errLabel = document.createElement("span")
    errLabel.className = "__tl2_error_label"
    errLabel.textContent = "post failed"
    errEl.appendChild(errLabel)
    errEl.appendChild(document.createTextNode(msg))
    this.el.insertBefore(errEl, this.el.lastElementChild)
    this.errorEl = errEl
  }

  // ── Utilities ────────────────────────────────────────────────────────────────

  private makeStat(
    value: string,
    label: string
  ): { el: HTMLElement; valEl: HTMLElement } {
    const el = document.createElement("div")
    el.className = "__tl2_stat"

    const valEl = document.createElement("div")
    valEl.className = "__tl2_stat_val"
    valEl.textContent = value

    const labelEl = document.createElement("div")
    labelEl.className = "__tl2_stat_label"
    labelEl.textContent = label

    el.appendChild(valEl)
    el.appendChild(labelEl)
    return { el, valEl }
  }

  private countOutcomes(
    visits: NodeState["visits"]
  ): Record<Outcome, number> {
    const counts: Record<Outcome, number> = {
      Progress: 0,
      Stuck: 0,
      Review: 0,
    }
    for (const v of visits) counts[v.outcome]++
    return counts
  }

  private formatLastSeen(visits: NodeState["visits"]): string {
    if (visits.length === 0) return "never"
    const last = Math.max(...visits.map((v) => v.timestamp))
    const diffMs = Date.now() - last
    const diffMin = Math.floor(diffMs / 60_000)
    const diffHr = Math.floor(diffMin / 60)
    const diffDay = Math.floor(diffHr / 24)
    if (diffMin < 1) return "just now"
    if (diffMin < 60) return `${diffMin}m ago`
    if (diffHr < 24) return `${diffHr}h ago`
    return `${diffDay}d ago`
  }

  private gateText(activeMs: number): string {
    const remaining = Math.ceil(
      (MIN_ACTIVE_MS_TO_REGISTER - activeMs) / 1000
    )
    if (remaining > 60) return `${Math.ceil(remaining / 60)}m to unlock`
    return `${remaining}s to unlock`
  }

  getElement(): HTMLElement {
    return this.el
  }
}
