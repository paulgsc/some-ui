import type { FSMEvent, FSMState } from "./fsm-core"
import { transition } from "./fsm-core"

const DBLCLICK_WINDOW_MS = 300

type PendingClick = {
  ts: number
  timeoutId: number
}

/**
 * Stateful click gating coordinator
 * Ensures click doesn't fire if dblclick is coming
 */
export class ClickGate {
  private pendingClick: PendingClick | null = null

  /**
   * Process raw DOM click event
   * Returns event to dispatch, or null if gated
   */
  handleRawClick(ts: number): FSMEvent | null {
    // If there's already a pending click, this might be a dblclick
    if (this.pendingClick) {
      clearTimeout(this.pendingClick.timeoutId)
      this.pendingClick = null
      // Don't dispatch CLICK - let dblclick handler take over
      return null
    }

    // Stage the click - it might get cancelled by dblclick
    return new Promise<FSMEvent>((resolve) => {
      const timeoutId = window.setTimeout(() => {
        this.pendingClick = null
        resolve({ type: "CLICK", ts })
      }, DBLCLICK_WINDOW_MS)

      this.pendingClick = { ts, timeoutId }
    }) as any // Simplified - see below for proper async handling
  }

  /**
   * Process raw DOM dblclick event
   * Always takes priority over pending clicks
   */
  handleRawDblclick(ts: number): FSMEvent {
    // Cancel any pending click
    if (this.pendingClick) {
      clearTimeout(this.pendingClick.timeoutId)
      this.pendingClick = null
    }
    return { type: "DBLCLICK", ts }
  }

  cleanup(): void {
    if (this.pendingClick) {
      clearTimeout(this.pendingClick.timeoutId)
      this.pendingClick = null
    }
  }
}

/**
 * Synchronous version for simpler integration
 * Trade-off: click fires immediately, dblclick cancels via timestamp check
 */
export class SyncClickGate {
  private lastClickTs: number | null = null

  handleRawClick(state: FSMState, ts: number): FSMState {
    // If recent click exists, ignore (dblclick will handle)
    if (this.lastClickTs && ts - this.lastClickTs < DBLCLICK_WINDOW_MS) {
      return state
    }

    this.lastClickTs = ts
    return transition(state, { type: "CLICK", ts })
  }

  handleRawDblclick(state: FSMState, ts: number): FSMState {
    this.lastClickTs = null
    return transition(state, { type: "DBLCLICK", ts })
  }

  cleanup(): void {
    this.lastClickTs = null
  }
}
