/**
 * The Actuator (BC4, #1437) — Boundary Contract B7: the only writer.
 *
 * `realize(actions)` executes what Core named and decides nothing. It is
 * the one module in the new architecture that mutates VendorDOM (stamps,
 * veils, the anchoring position) or calls `browser.*` (the whitelist
 * messages) — every such write lives here or in a file this module owns
 * (`veil.ts`, `gestures.ts`). Answers to the effects it performs — the
 * background's whitelist verdict, the title hook's result, a timer firing,
 * a click on a veil — go back to Core as `Input`s through `inbox`, never as
 * calls into it.
 *
 * Invariants, carried over from `dom-handle.ts` where they apply:
 *
 *   A1 — Anchoring (D1). An anchor gets `position: relative` if it was
 *        static, so the veil's `inset: 0` binds to the card.
 *   A2 — Single veil (D2). One veil per anchor, re-attached if the vendor
 *        removed it, never duplicated.
 *   A3 — Idempotent (D2, and #1437's own bar). Realizing the same actions
 *        twice leaves the same DOM: a render whose model and targets are
 *        unchanged re-asserts the stamps and touches nothing else.
 *   A4 — Full cleanup (D3). `unmount` leaves every element it stamped as it
 *        was before; `dispose` does so for everything at once.
 *   A5 — Custody is accounted for here, once (D6, and the lesson of #1432's
 *        eighth round). Which elements carry which key's stamp is one map in
 *        this module; a render diffs its targets against it and strips the
 *        elements that left — but only those this key still owns, so an
 *        element that moved to another card keeps that card's stamp
 *        whichever render runs first.
 *   A6 — No class names (D5): every class string comes from veil-styles.ts.
 */

import type { CoreFact } from "@censor/lib/content/core/actions"
import type { Input } from "@censor/lib/content/core/events"
import type { CardKey } from "@censor/lib/content/core/keys"
import { keyVideoId } from "@censor/lib/content/core/keys"
import type { RenderModel } from "@censor/lib/content/fsm"
import type { ChannelId, VideoId } from "@censor/types/ids"
import type { BgRequest } from "@censor/types/messages"

import type { BoundAction, CustodyTarget } from "./bound"
import type { GestureDelegation } from "./gestures"
import { attachGestures } from "./gestures"
import { beginVeilExit, createVeil, renderVeil } from "./veil"

/** How long the veil's exit animation is given before it is removed anyway. */
export const VEIL_EXIT_FALLBACK_MS = 600

export type ActuatorPorts = {
  readonly doc: Document
  /** Where answers to effects go — Core's input queue. */
  readonly inbox: (input: Input) => void
  /** The shell's clock, stamped onto every input this module produces. */
  readonly clock: () => number
  /** The flight recorder. */
  readonly onFact: (fact: CoreFact) => void
  /** `ext.runtime.sendMessage`. */
  readonly sendMessage: (msg: BgRequest) => Promise<unknown>
  /** The optional title-transform hook, read at call time. */
  readonly titleHook: () => unknown
  /** The whitelist confirmation prompt. */
  readonly confirmWhitelist: () => boolean
}

export type Actuator = {
  realize(actions: ReadonlyArray<BoundAction>): void
  /** Stamps a key currently holds, for the debug layer. */
  custodyOf(key: CardKey): ReadonlyArray<HTMLElement>
  dispose(): void
}

type Realized = {
  model: RenderModel
  anchors: Set<HTMLElement>
  nested: Set<HTMLElement>
  veils: Map<HTMLElement, HTMLElement>
}

type TransformTitleFn = (title: string, channelId: string) => unknown

export function createActuator(ports: ActuatorPorts): Actuator {
  const realized = new Map<CardKey, Realized>()
  const owner = new WeakMap<HTMLElement, CardKey>()
  const timers = new Map<CardKey, Set<ReturnType<typeof setTimeout>>>()
  const exits = new Set<ReturnType<typeof setTimeout>>()
  let disposed = false

  const gestures: GestureDelegation = attachGestures(ports.doc, {
    inbox: ports.inbox,
    clock: ports.clock,
    confirmWhitelist: ports.confirmWhitelist,
  })

  // ── Timers ─────────────────────────────────────────────────────────────

  function later(key: CardKey, delayMs: number, fn: () => void): void {
    const set = timers.get(key) ?? new Set()
    timers.set(key, set)
    const handle = setTimeout(() => {
      set.delete(handle)
      if (set.size === 0) timers.delete(key)
      if (!disposed) fn()
    }, delayMs)
    set.add(handle)
  }

  function cancelTimers(key: CardKey): void {
    for (const handle of timers.get(key) ?? []) clearTimeout(handle)
    timers.delete(key)
  }

  // ── Stamps and veils ───────────────────────────────────────────────────

  function strip(el: HTMLElement, rec: Realized): void {
    const veil = rec.veils.get(el)
    if (veil !== undefined) {
      veil.remove()
      rec.veils.delete(el)
    }
    delete el.dataset["boyo"]
    delete el.dataset["boyoVid"]
    owner.delete(el)
  }

  /**
   * Make `key` the owner of `el`. If another key still holds it — the
   * element moved from one card to another before the old card's next
   * render — the old card's veil and bookkeeping for it go now, so the two
   * never coexist on one element (A2, A5).
   */
  function takeOver(el: HTMLElement, key: CardKey): void {
    const previous = owner.get(el)
    if (previous !== undefined && previous !== key) {
      const rec = realized.get(previous)
      if (rec !== undefined) {
        rec.veils.get(el)?.remove()
        rec.veils.delete(el)
        rec.anchors.delete(el)
        rec.nested.delete(el)
      }
    }
    owner.set(el, key)
  }

  function removeVeilAnimated(anchor: HTMLElement, rec: Realized): void {
    const veil = rec.veils.get(anchor)
    if (veil === undefined) return
    rec.veils.delete(anchor)
    beginVeilExit(veil)
    const remove = (): void => {
      clearTimeout(fallback)
      exits.delete(fallback)
      veil.remove()
    }
    veil.addEventListener("animationend", remove, { once: true })
    const fallback = setTimeout(remove, VEIL_EXIT_FALLBACK_MS)
    exits.add(fallback)
  }

  function render(
    key: CardKey,
    model: RenderModel,
    targets: ReadonlyArray<CustodyTarget>
  ): void {
    const rec: Realized = realized.get(key) ?? {
      model,
      anchors: new Set(),
      nested: new Set(),
      veils: new Map(),
    }
    const modelChanged = !realized.has(key) || !sameModel(rec.model, model)
    const anchors = new Set<HTMLElement>()
    const nested = new Set<HTMLElement>()
    for (const t of targets) (t.role === "anchor" ? anchors : nested).add(t.el)

    // A5: elements that left this key's custody, and are still this key's.
    for (const el of [...rec.anchors, ...rec.nested]) {
      if (anchors.has(el) || nested.has(el)) continue
      if (owner.get(el) === key) strip(el, rec)
    }
    // An anchor demoted to nested custody loses its veil.
    for (const el of rec.anchors) {
      if (nested.has(el)) {
        rec.veils.get(el)?.remove()
        rec.veils.delete(el)
        delete el.dataset["boyoVid"]
      }
    }

    const videoId: VideoId = keyVideoId(key)
    for (const el of anchors) {
      takeOver(el, key)
      // A1. An empty computed value is what an engine with no stylesheet
      // for the element (a bare test document) reports for `static`.
      const position = getComputedStyle(el).position
      if (position === "static" || position === "") {
        el.style.position = "relative"
      }
      el.dataset["boyoVid"] = videoId
      el.dataset["boyo"] = model.dataBoyo
      if (model.removeVeil) {
        removeVeilAnimated(el, rec)
        continue
      }
      // A2
      const existing = rec.veils.get(el)
      const fresh = !existing?.isConnected
      let veil: HTMLElement
      if (existing?.isConnected) {
        veil = existing
      } else {
        existing?.remove()
        veil = createVeil(ports.doc)
        el.appendChild(veil)
        rec.veils.set(el, veil)
      }
      if (fresh || modelChanged) renderVeil(veil, model)
    }
    for (const el of nested) {
      takeOver(el, key)
      el.dataset["boyo"] = model.dataBoyo
    }

    rec.model = model
    rec.anchors = anchors
    rec.nested = nested
    realized.set(key, rec)
  }

  function unmount(key: CardKey, targets: ReadonlyArray<CustodyTarget>): void {
    const rec = realized.get(key)
    if (rec !== undefined) {
      for (const el of [...rec.anchors, ...rec.nested]) {
        if (owner.get(el) === key) strip(el, rec)
      }
      // A veil mid-exit is not in `veils` any more; it removes itself.
    }
    // Targets the runtime still associates with the key but this module
    // never stamped (a race between observation and realization): nothing
    // to strip, and never another key's stamp.
    for (const { el } of targets) {
      if (owner.get(el) === key && rec !== undefined) strip(el, rec)
    }
    realized.delete(key)
    cancelTimers(key)
    gestures.forget(key)
  }

  // ── Effects ────────────────────────────────────────────────────────────

  function queryWhitelist(
    key: CardKey,
    generation: number,
    query: number,
    channelId: ChannelId
  ): void {
    void ports
      .sendMessage({ type: "IS_WHITELISTED", channelId })
      .then((r: unknown) => isWhitelistedResponse(r) && r.whitelisted)
      .catch(() => false)
      .then((whitelisted) => {
        if (disposed) return
        // The incarnation and the id Core asked about, echoed so its R4
        // check has something to compare against: a card re-adopted while
        // this request was in flight must not take this answer.
        ports.inbox({
          kind: "whitelist-answer",
          key,
          generation,
          query,
          channelId,
          whitelisted,
          t: ports.clock(),
        })
      })
  }

  function persistWhitelist(channelId: string, channelName: string): void {
    void ports
      .sendMessage({ type: "ADD_WHITELIST", channelId, channelName })
      .catch((err: unknown) => {
        // eslint-disable-next-line no-console
        console.error("[BOYO] persist-whitelist: sendMessage failed", err)
      })
  }

  function transformTitle(
    key: CardKey,
    generation: number,
    version: number,
    text: string,
    channelId: string
  ): void {
    const fn = ports.titleHook()
    if (typeof fn !== "function") return
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const transform = fn as TransformTitleFn
    void Promise.resolve()
      .then(() => transform(text, channelId))
      .then((result) => {
        if (disposed || typeof result !== "string") return
        ports.inbox({
          kind: "title-transformed",
          key,
          generation,
          version,
          text: result,
          translated: true,
          t: ports.clock(),
        })
      })
      .catch(() => {
        // Hook failure must never break the reveal flow.
      })
  }

  // ── Public ─────────────────────────────────────────────────────────────

  return {
    realize(actions: ReadonlyArray<BoundAction>): void {
      if (disposed) return
      for (const bound of actions) {
        const { action } = bound
        const { kind } = action
        switch (kind) {
          case "render": {
            if ("targets" in bound)
              render(action.key, action.model, bound.targets)
            break
          }
          case "unmount": {
            if ("targets" in bound) unmount(action.key, bound.targets)
            break
          }
          case "query-whitelist": {
            queryWhitelist(
              action.key,
              action.generation,
              action.query,
              action.channelId
            )
            break
          }
          case "persist-whitelist": {
            persistWhitelist(action.channelId, action.channelName)
            break
          }
          case "transform-title": {
            transformTitle(
              action.key,
              action.generation,
              action.version,
              action.text,
              action.channelId ?? ""
            )
            break
          }
          case "schedule": {
            const { key, generation, version } = action
            later(key, action.delayMs, () =>
              ports.inbox({
                kind: "timer",
                key,
                generation,
                version,
                t: ports.clock(),
              })
            )
            break
          }
          case "record": {
            ports.onFact(action.fact)
            break
          }
          default: {
            kind satisfies never
            throw new Error("[BOYO] unknown action", { cause: action })
          }
        }
      }
    },

    custodyOf(key: CardKey): ReadonlyArray<HTMLElement> {
      const rec = realized.get(key)
      return rec === undefined ? [] : [...rec.anchors, ...rec.nested]
    },

    dispose(): void {
      if (disposed) return
      disposed = true
      gestures.dispose()
      for (const key of [...realized.keys()]) unmount(key, [])
      for (const handle of exits) clearTimeout(handle)
      exits.clear()
    },
  }
}

function isWhitelistedResponse(r: unknown): r is { whitelisted: boolean } {
  return (
    r !== null &&
    typeof r === "object" &&
    typeof Reflect.get(r, "whitelisted") === "boolean"
  )
}

/** Structural equality over the (small, flat-ish) render model. */
function sameModel(a: RenderModel, b: RenderModel): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
