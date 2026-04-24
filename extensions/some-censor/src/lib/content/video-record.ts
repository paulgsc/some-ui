
import type { ViewState, FsmEvent }  from "@censor/types/states"
import type { Resolved }              from "@censor/types/states"
import type { VideoId, ChannelId }    from "@censor/types/ids"
import { transition }                 from "./fsm"
import { renderView }                 from "./render"
import { ClickGate }                  from "./click-gate"

/**
 * Stateful per-video orchestrator.
 *
 * Owns:
 *   identity  — { el, videoId, channelId }  (from Resolved node state)
 *   _view     — current ViewState (FSM)
 *   _veil     — .boyo-veil HTMLElement | null
 *   _version  — monotonic counter; guards stale async writes (title transform)
 *   gate      — ClickGate
 *
 * Separation of concerns:
 *   - transition() (fsm.ts) is pure: computes next ViewState, no DOM
 *   - renderView() (render.ts) is pure: projects ViewState → DOM, no async
 *   - _applyView() here is the only place that sequences them with async in between
 */
export class VideoRecord {
  readonly el:        HTMLElement
  readonly videoId:   VideoId
  readonly channelId: ChannelId
  readonly gate:      ClickGate

  private _view:    ViewState
  private _veil:    HTMLElement | null = null
  private _version: number             = 0

  constructor(identity: Resolved, isWhitelisted: boolean) {
    this.el        = identity.el
    this.videoId   = identity.videoId
    this.channelId = identity.channelId
    this._view     = isWhitelisted ? { kind: "whitelisted" } : { kind: "masked" }
    this.gate      = new ClickGate(this._onCommit.bind(this))
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  mount(): void {
    // Cache videoId on element for O(1) event delegation (no re-extraction needed)
    this.el.dataset["boyoVid"] = this.videoId
    this._ensureVeil()
    this._applyView(this._view)
  }

  /**
   * Repair veil if YouTube's scroll virtualizer nuked our child element.
   * Does NOT reset view state — state-on-parent survives DOM churn.
   */
  repair(): void {
    if (!this._veil || !this.el.contains(this._veil)) {
      this._veil = null
      if (this._view.kind !== "revealed") {
        this._ensureVeil()
        renderView(this._view, this._veil!, this.el)
      }
    }
  }

  destroy(): void {
    this.gate.destroy()
    this._veil?.remove()
    this._veil = null
    delete this.el.dataset["boyo"]
    delete this.el.dataset["boyoVid"]
  }

  // ── FSM dispatch ──────────────────────────────────────────────────────────

  /** Called by VideoManager when this channel is whitelisted from any source. */
  dispatchWhitelist(): void {
    this._onCommit("WHITELIST")
  }

  private _onCommit(event: FsmEvent): void {
    const next = transition(this._view, event, this.el)
    if (next === this._view) return  // pure no-op transition
    this._applyView(next)
  }

  /**
   * Apply a new view state:
   *   1. Bump version (guards stale async writes)
   *   2. For title state: run optional async title transform before rendering
   *   3. Call renderView (pure DOM projection)
   *   4. Schedule side-effects (veil removal, whitelist auto-reveal)
   */
  private async _applyView(incoming: ViewState): Promise<void> {
    const version = ++this._version
    this._view = incoming

    if (incoming.kind === "revealed") {
      this._removeVeil()
      this.el.dataset["boyo"] = "3"
      return
    }

    // Async title transform — must run before renderView so chip shows final text.
    // We work with a local `view` so the async mutation doesn't alias `this._view`.
    let view: ViewState = incoming

    if (view.kind === "title" && view.title.text) {
      const { text, translated } = await maybeTransformTitle(view.title.text, this.channelId)
      if (version !== this._version) return  // state changed while we awaited — discard
      view = { ...view, title: { text, translated } }
      this._view = view
    }

    this._ensureVeil()
    renderView(view, this._veil!, this.el)

    if (view.kind === "whitelisted") {
      setTimeout(() => {
        if (version === this._version) this._applyView({ kind: "revealed" })
      }, 1800)
    }
  }

  // ── DOM helpers ───────────────────────────────────────────────────────────

  private _ensureVeil(): void {
    if (this._veil && this.el.contains(this._veil)) return
    const v = document.createElement("div")
    v.className = "boyo-veil"
    this.el.appendChild(v)
    this._veil = v
  }

  private _removeVeil(): void {
    if (!this._veil) return
    const veil = this._veil
    this._veil = null
    veil.addEventListener("animationend", () => veil.remove(), { once: true })
    setTimeout(() => veil.remove(), 600)  // fallback if animation doesn't fire
  }
}

// ── Title transform hook ──────────────────────────────────────────────────────
// Consumers set window.__boyoTransformTitle before this script runs.
// Signature: async (title: string, channelId: string) => string
// Falls back to original title if hook is absent, returns non-string, or throws.

async function maybeTransformTitle(
  title:     string,
  channelId: string,
): Promise<{ text: string; translated: boolean }> {
  try {
    const fn = (window as unknown as Record<string, unknown>)["__boyoTransformTitle"]
    if (typeof fn === "function") {
      const result = await (fn as (t: string, c: string) => Promise<unknown>)(title, channelId)
      if (result && typeof result === "string") return { text: result, translated: true }
    }
  } catch (_) {
    // Swallow — hook failure must never break reveal flow
  }
  return { text: title, translated: false }
}
