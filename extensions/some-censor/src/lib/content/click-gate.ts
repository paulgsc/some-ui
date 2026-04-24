import type { FsmEvent } from "@censor/types/states"

const DBLCLICK_WINDOW_MS = 300

/**
 * Async click gate — disambiguates click from dblclick.
 *
 * Browser fires events in this order for a dblclick:
 *   mousedown → mouseup → click → mousedown → mouseup → click → dblclick
 *
 * Strategy:
 *   rawClick   — stages a CLICK commit for DBLCLICK_WINDOW_MS.
 *                If a second rawClick arrives before the timer fires,
 *                the staged commit is cancelled (dblclick in progress).
 *   rawDblClick — cancels any staged click and commits DBLCLICK immediately.
 *
 * onCommit fires exactly once per logical interaction.
 */
export class ClickGate {
  private _timer: ReturnType<typeof setTimeout> | null = null
  private readonly _onCommit: (event: FsmEvent) => void

  constructor(onCommit: (event: FsmEvent) => void) {
    this._onCommit = onCommit
  }

  rawClick(): void {
    if (this._timer !== null) {
      // Second click within window → part of dblclick sequence; cancel staged commit
      clearTimeout(this._timer)
      this._timer = null
      return
    }
    this._timer = setTimeout(() => {
      this._timer = null
      this._onCommit("CLICK")
    }, DBLCLICK_WINDOW_MS)
  }

  rawDblClick(): void {
    if (this._timer !== null) {
      clearTimeout(this._timer)
      this._timer = null
    }
    this._onCommit("DBLCLICK")
  }

  destroy(): void {
    if (this._timer !== null) {
      clearTimeout(this._timer)
      this._timer = null
    }
  }
}
