/**
 * VideoEntry — per-card orchestrator.
 *
 * This is the only place that connects the pure FSM layer to the impure DOM
 * layer.  The connection is explicit and narrow:
 *
 *   pure side:   VideoRecord + ViewState + transition functions
 *   impure side: DomHandle (exactly one per entry)
 *
 * Invariants:
 *
 *   Entry-1 — One DomHandle per entry.  Constructed once, destroyed once.
 *
 *   Entry-2 — ViewState carries session.  Stale async writes are detected by
 *             comparing `_version` (monotonic counter) rather than by session,
 *             because a single session can have multiple async title transforms
 *             in flight.  Session handles the inter-lifecycle case; version
 *             handles the intra-lifecycle async race.
 *
 *   Entry-3 — destroy() is final.  After destroy(), the entry must not be used.
 *             VideoManager enforces this by deleting its reference immediately.
 */

import { ClickGate } from "./click-gate"
import { DomHandle } from "./dom-handle"
import { extractMeta, extractTitle } from "./extract/index"
import type { ViewState } from "./fsm"
import {
  applyClick,
  applyDblClick,
  applySkipToTitle,
  applyWhitelist,
  project,
} from "./fsm"
import type { VideoRecord } from "./record"

export class VideoEntry {
  readonly record: VideoRecord
  readonly gate: ClickGate

  private _view: ViewState
  private _handle: DomHandle
  private _version: number = 0

  constructor(record: VideoRecord, el: HTMLElement, isWhitelisted: boolean) {
    this.record = record
    this._handle = new DomHandle(el)
    this._view = isWhitelisted
      ? { kind: "whitelisted", session: record.session }
      : { kind: "masked", session: record.session }
    this.gate = new ClickGate(this._onCommit.bind(this))

    // Cache videoId on element for O(1) event delegation
    el.dataset["boyoVid"] = record.videoId
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  mount(): void {
    this._applyView(this._view)
  }

  repair(): void {
    this._handle.repair(project(this._view))
  }

  destroy(): void {
    this.gate.destroy()
    this._handle.destroy()
  }

  dispatchWhitelist(): void {
    this._onCommit("WHITELIST")
  }

  /**
   * Programmatically advance this entry to TitleState if it is currently below it.
   *
   * Called by VideoManager.advanceAllToTitle() on every entry in the registry.
   * Safe to call unconditionally - the kind guard makes it a no-op for entries
   * thata are already at or past title.
   */
  advanceToTitle(): void {
    if (!this._handle.element.isConnected) return

    switch (this._view.kind) {
      case "title":
      case "revealed":
      case "whitelisted":
        return
      case "masked":
      case "meta": {
        const el = this._handle.element
        const meta = extractMeta(el)
        const titleText = extractTitle(el) ?? ""

        const next = applySkipToTitle(this._view, meta, titleText)

        void this._applyView(next)
        return
      }

      default:
        this._view satisfies never
        throw new Error(`Unhandled shape`, { cause: this._view })
    }
  }

  /** * Bridge to DomHandle connection status.
   * This is the signal for the Manager to prune.
   */
  get isConnected(): boolean {
    return this._handle.element.isConnected
  }

  /** Exposed for the debug/observability layer — read-only snapshot of FSM kind. */
  get viewKind(): ViewState["kind"] {
    return this._view.kind
  }

  // ── FSM dispatch ──────────────────────────────────────────────────────────

  private _onCommit(event: "CLICK" | "DBLCLICK" | "WHITELIST"): void {
    let next: ViewState

    switch (event) {
      case "CLICK":
        next = this._applyClickTransition()
        break
      case "DBLCLICK":
        next = applyDblClick(this._view)
        break
      case "WHITELIST":
        next = applyWhitelist(this._view)
        break
    }

    if (next === this._view) return
    this._applyView(next)
  }

  private _applyClickTransition(): ViewState {
    const el = this._handle.element
    switch (this._view.kind) {
      case "masked":
        return applyClick(this._view, extractMeta(el))
      case "meta":
        return applyClick(this._view, extractTitle(el) ?? "")
      default:
        return this._view
    }
  }

  private async _applyView(incoming: ViewState): Promise<void> {
    const version = ++this._version
    this._view = incoming

    let view: ViewState = incoming

    // Async title transform — guarded by version to detect stale writes
    if (view.kind === "title" && view.title.text) {
      const { text, translated } = await maybeTransformTitle(
        view.title.text,
        this.record.channelId
      )
      if (version !== this._version) return // state changed while awaiting
      view = { ...view, title: { text, translated } }
      this._view = view
    }

    this._handle.apply(project(view))

    if (view.kind === "whitelisted") {
      setTimeout(() => {
        if (version === this._version) {
          this._applyView({ kind: "revealed", session: view.session })
        }
      }, 1800)
    }
  }
}

// ── Title transform hook ──────────────────────────────────────────────────────

async function maybeTransformTitle(
  title: string,
  channelId: string
): Promise<{ text: string; translated: boolean }> {
  try {
    const fn = (window as unknown as Record<string, unknown>)[
      "__boyoTransformTitle"
    ]
    if (typeof fn === "function") {
      const result = await (fn as (t: string, c: string) => Promise<unknown>)(
        title,
        channelId
      )
      if (result && typeof result === "string")
        return { text: result, translated: true }
    }
  } catch {
    // Hook failure must never break reveal flow
  }
  return { text: title, translated: false }
}
