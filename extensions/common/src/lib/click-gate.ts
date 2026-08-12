/**
 * Click/double-click disambiguation gate — defined once in commons.
 *
 * Every extension that puts a clickable overlay on a vendor page hits the same
 * problem: the browser fires a full single-click sequence *before* it knows a
 * double-click is coming.
 *
 *   mousedown → mouseup → click → mousedown → mouseup → click → dblclick
 *
 * Acting on the first `click` therefore commits the single-click action on the
 * way to every double-click. The gate stages the single-click commit for
 * `windowMs` and cancels it if a second click (or a `dblclick`) arrives first,
 * so `onCommit` fires exactly once per logical interaction.
 *
 * The gate is domain-free: it knows nothing about what a click *means*. The
 * caller supplies the two payloads it should emit, so a workspace keeps its own
 * event vocabulary (`"CLICK"`/`"DBLCLICK"`, `"expand"`/`"pin"`, …) without the
 * commons learning any of them.
 *
 * Model lifted from some-censor/src/lib/content/click-gate.ts.
 * See GOOD_CITIZEN.md § 8 (one timer, registered for deterministic teardown).
 */

/** The two payloads a gate can emit, one per logical interaction. */
export type ClickGateEvents<Event> = {
  /** Emitted when a click settles without a second click following it. */
  readonly single: Event
  /** Emitted immediately on `dblclick`. */
  readonly double: Event
}

/**
 * Default disambiguation window, in milliseconds.
 *
 * 300ms is the interval the platform double-click threshold sits at on every
 * engine we target; a shorter window commits singles during real double-clicks.
 */
export const DEFAULT_DBLCLICK_WINDOW_MS = 300

export class ClickGate<Event> {
  private _timer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly _onCommit: (event: Event) => void,
    private readonly _events: ClickGateEvents<Event>,
    private readonly _windowMs: number = DEFAULT_DBLCLICK_WINDOW_MS
  ) {}

  /**
   * Feed a raw `click`.
   *
   * First call stages the single commit; a second call inside the window is
   * read as "a double-click is in progress" and cancels the staged commit
   * without emitting anything — `rawDblClick` is what commits it.
   */
  rawClick(): void {
    if (this._timer !== null) {
      clearTimeout(this._timer)
      this._timer = null
      return
    }
    this._timer = setTimeout(() => {
      this._timer = null
      this._onCommit(this._events.single)
    }, this._windowMs)
  }

  /** Feed a raw `dblclick`. Cancels any staged single and commits immediately. */
  rawDblClick(): void {
    if (this._timer !== null) {
      clearTimeout(this._timer)
      this._timer = null
    }
    this._onCommit(this._events.double)
  }

  /** Cancel any staged commit. Idempotent; safe to call after destroy(). */
  destroy(): void {
    if (this._timer !== null) {
      clearTimeout(this._timer)
      this._timer = null
    }
  }
}
