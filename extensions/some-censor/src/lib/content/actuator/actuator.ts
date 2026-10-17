/**
 * The Actuator (BC4) — Boundary Contract B7: the only writer.
 *
 * `realize(actions)` executes what Core named and decides nothing. It is
 * the one module that mutates VendorDOM (stamps, veils, the anchoring
 * position); every such write lives here or in a file this module owns
 * (`veil.ts`, and `switch.ts` for the page-wide off switch). Nothing it does
 * produces an input for Core.
 *
 * Design properties, pinned by `actuator.test.ts` (labels for citation, not
 * declared review invariants). The parenthesised D-numbers are the veil
 * ledger's labels, kept so
 * citations elsewhere resolve; D5 is also stated in `veil.ts`, and D6 is
 * nested custody: an element inside an anchor that matches a pre-mask rule
 * of its own gets `data-boyo` so the occluder releases it, and no veil.
 *
 *   A1 — Anchoring (D1). An anchor gets `position: relative` if it was
 *        static, so the veil's `inset: 0` binds to the card; the inline
 *        value it replaced is remembered and put back when the element
 *        stops being an anchor (A4).
 *   A2 — Single veil (D2). One veil per anchor whose model asks for one,
 *        re-attached if the vendor removed it, never duplicated, and removed
 *        at once when the model stops asking for it.
 *   A3 — Idempotent (D2). Realizing the same actions
 *        twice leaves the same DOM: a render whose model and targets are
 *        unchanged re-asserts the stamps and touches nothing else.
 *   A4 — Full cleanup (D3, D4). `unmount` leaves every element it stamped
 *        as it was before — stamps, veil and the anchoring position — and
 *        drops the key's record; `dispose` does so for everything at once.
 *   A5 — Custody is accounted for here, once (D6). Which elements carry which
 *        key's stamp is one map in
 *        this module; a render diffs its targets against it and strips the
 *        elements that left — but only those this key still owns, so an
 *        element that moved to another card keeps that card's stamp
 *        whichever render runs first.
 *   A6 — No class names (D5): every class string comes from veil-styles.ts.
 */

import type { CardKey } from "@censor/lib/content/core/keys"
import { keyVideoId } from "@censor/lib/content/core/keys"
import type { RenderModel } from "@censor/lib/content/fsm"
import type { VideoId } from "@censor/types/ids"

import type { BoundAction, CustodyTarget } from "./bound"
import { createVeil } from "./veil"

export type ActuatorPorts = {
  readonly doc: Document
}

export type Actuator = {
  realize(actions: ReadonlyArray<BoundAction>): void
  /** Stamps a key currently holds, for the debug layer. */
  custodyOf(key: CardKey): ReadonlyArray<HTMLElement>
  dispose(): void
}

type Realized = {
  anchors: Set<HTMLElement>
  nested: Set<HTMLElement>
  veils: Map<HTMLElement, HTMLElement>
}

type InlineDeclaration = {
  value: string
  /** `"important"` or `""`, as `getPropertyPriority` reports it. */
  priority: string
}

function positionOf(el: HTMLElement): InlineDeclaration {
  return {
    value: el.style.getPropertyValue("position"),
    priority: el.style.getPropertyPriority("position"),
  }
}

/** Exactly the declaration A1 writes — and nothing the vendor would. */
function isAnchoring(d: InlineDeclaration): boolean {
  return d.value === "relative" && d.priority === ""
}

export function createActuator(ports: ActuatorPorts): Actuator {
  const realized = new Map<CardKey, Realized>()
  const owner = new WeakMap<HTMLElement, CardKey>()
  /**
   * The inline `position` declaration — value and priority — an anchor had
   * before A1 wrote `relative` over it. Those two are all an inline
   * declaration of one property carries, so the restore is complete.
   */
  const anchored = new WeakMap<HTMLElement, InlineDeclaration>()
  let disposed = false

  // ── Stamps and veils ───────────────────────────────────────────────────

  /**
   * A1's write, undone: the inline position the element had is restored —
   * unless the inline declaration is no longer the one this module wrote
   * (`relative`, no priority), in which case the vendor has taken the
   * property back since and its declaration stays.
   */
  function unanchor(el: HTMLElement): void {
    const prior = anchored.get(el)
    if (prior === undefined) return
    anchored.delete(el)
    if (!isAnchoring(positionOf(el))) return
    el.style.setProperty("position", prior.value, prior.priority)
    if (el.getAttribute("style") === "") el.removeAttribute("style")
  }

  function removeVeil(anchor: HTMLElement, rec: Realized): void {
    rec.veils.get(anchor)?.remove()
    rec.veils.delete(anchor)
  }

  function strip(el: HTMLElement, rec: Realized): void {
    removeVeil(el, rec)
    unanchor(el)
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
        removeVeil(el, rec)
        rec.anchors.delete(el)
        rec.nested.delete(el)
      }
    }
    owner.set(el, key)
  }

  function render(
    key: CardKey,
    model: RenderModel,
    targets: ReadonlyArray<CustodyTarget>
  ): void {
    const rec: Realized = realized.get(key) ?? {
      anchors: new Set(),
      nested: new Set(),
      veils: new Map(),
    }
    const anchors = new Set<HTMLElement>()
    const nested = new Set<HTMLElement>()
    for (const t of targets) (t.role === "anchor" ? anchors : nested).add(t.el)

    // A5: elements that left this key's custody, and are still this key's.
    for (const el of [...rec.anchors, ...rec.nested]) {
      if (anchors.has(el) || nested.has(el)) continue
      if (owner.get(el) === key) strip(el, rec)
    }
    // An anchor demoted to nested custody loses its veil and its anchoring.
    for (const el of rec.anchors) {
      if (nested.has(el)) {
        removeVeil(el, rec)
        unanchor(el)
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
        // What is written over is what will be restored: the vendor may
        // have taken the property back since the last anchoring.
        const current = positionOf(el)
        if (!isAnchoring(current)) anchored.set(el, current)
        el.style.position = "relative"
      }
      el.dataset["boyoVid"] = videoId
      el.dataset["boyo"] = model.dataBoyo
      if (!model.veil) {
        removeVeil(el, rec)
        continue
      }
      // A2. The veil is reused only while it is still this anchor's child:
      // one the vendor detached — or reparented elsewhere, which leaves it
      // connected — is replaced, so the stamp never disables the static
      // occluder on a card with no veil of its own.
      const existing = rec.veils.get(el)
      if (existing?.parentElement === el) continue
      existing?.remove()
      const veil = createVeil(ports.doc)
      el.appendChild(veil)
      rec.veils.set(el, veil)
    }
    for (const el of nested) {
      takeOver(el, key)
      // An element that was another card's anchor keeps nothing of that:
      // not the anchoring, not the self-tag (D6).
      unanchor(el)
      delete el.dataset["boyoVid"]
      el.dataset["boyo"] = model.dataBoyo
    }

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
    }
    // Targets the runtime still associates with the key but this module
    // never stamped (a race between observation and realization): nothing
    // to strip, and never another key's stamp.
    for (const { el } of targets) {
      if (owner.get(el) === key && rec !== undefined) strip(el, rec)
    }
    realized.delete(key)
  }

  // ── Public ─────────────────────────────────────────────────────────────

  return {
    realize(actions: ReadonlyArray<BoundAction>): void {
      if (disposed) return
      for (const { action, targets } of actions) {
        const { kind } = action
        switch (kind) {
          case "render": {
            render(action.key, action.model, targets)
            break
          }
          case "unmount": {
            unmount(action.key, targets)
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
      for (const key of [...realized.keys()]) unmount(key, [])
    },
  }
}
