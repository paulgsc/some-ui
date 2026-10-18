/**
 * The Actuator (BC4) — Boundary Contract B7: the only writer.
 *
 * `realize(actions)` executes what Core named and decides nothing. It is
 * the one module that mutates VendorDOM (stamps and the plate's values);
 * every such write lives here or in a file this module owns (`switch.ts`
 * for the page-wide off switch). Nothing it does produces an input for
 * Core.
 *
 * Design properties, pinned by `actuator.test.ts` (labels for citation, not
 * declared review invariants). The parenthesised D-numbers are the veil
 * ledger's labels, kept so citations elsewhere resolve. D6 is nested
 * custody: an element inside an anchor that matches a pre-mask rule of its
 * own gets `data-boyo` so the occluder releases it, and no plate values.
 *
 *   A1 and A2 anchored and mounted the veil, which the plate replaced
 *   (#1804); both are retired.
 *   A3 — Idempotent (D2). Realizing the same actions twice leaves the same
 *        DOM: a render whose model and targets are unchanged re-asserts the
 *        stamps and the plate's values, and touches nothing else.
 *   A4 — Full cleanup (D3, D4). `unmount` leaves every element it stamped
 *        as it was before (stamps and the plate's values) and drops the
 *        key's record; `dispose` does so for everything at once.
 *   A5 — Custody is accounted for here, once (D6). Which elements carry which
 *        key's stamp is one map in
 *        this module; a render diffs its targets against it and strips the
 *        elements that left — but only those this key still owns, so an
 *        element that moved to another card keeps that card's stamp
 *        whichever render runs first.
 *   A6 — No class names (D5): this module writes none.
 */

import type { CardKey } from "@censor/lib/content/core/keys"
import { keyVideoId } from "@censor/lib/content/core/keys"
import type { Plate, RenderModel } from "@censor/lib/content/fsm"
import type { VideoId } from "@censor/types/ids"

import type { BoundAction, CustodyTarget } from "./bound"

export type Actuator = {
  realize(actions: ReadonlyArray<BoundAction>): void
  /** Stamps a key currently holds, for the debug layer. */
  custodyOf(key: CardKey): ReadonlyArray<HTMLElement>
  dispose(): void
}

type Realized = {
  anchors: Set<HTMLElement>
  nested: Set<HTMLElement>
}

/**
 * The plate's values, as custom properties on an anchor: `content.css` reads
 * them under `[data-boyo="plated"]`. Namespaced, so no vendor declaration is
 * ever written over and A4 can simply remove them.
 */
const PLATE_PROPERTIES = ["--boyo-plate", "--boyo-disc", "--boyo-initial"]

function setPlate(el: HTMLElement, plate: Plate | null): void {
  if (plate === null) {
    clearPlate(el)
    return
  }
  el.style.setProperty("--boyo-plate", plate.fill)
  el.style.setProperty("--boyo-disc", plate.disc)
  // A CSS string for `content`. The letter is a letter or a digit, never a
  // quote or a backslash (`plate.ts`'s `initial`).
  el.style.setProperty("--boyo-initial", `"${plate.initial}"`)
}

function clearPlate(el: HTMLElement): void {
  for (const property of PLATE_PROPERTIES) el.style.removeProperty(property)
  if (el.getAttribute("style") === "") el.removeAttribute("style")
}

export function createActuator(): Actuator {
  const realized = new Map<CardKey, Realized>()
  const owner = new WeakMap<HTMLElement, CardKey>()
  let disposed = false

  // ── Stamps ─────────────────────────────────────────────────────────────

  function strip(el: HTMLElement): void {
    clearPlate(el)
    delete el.dataset["boyo"]
    delete el.dataset["boyoVid"]
    owner.delete(el)
  }

  /**
   * Make `key` the owner of `el`. If another key still holds it — the
   * element moved from one card to another before the old card's next
   * render — the old card's bookkeeping for it goes now (A5).
   */
  function takeOver(el: HTMLElement, key: CardKey): void {
    const previous = owner.get(el)
    if (previous !== undefined && previous !== key) {
      const rec = realized.get(previous)
      if (rec !== undefined) {
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
    }
    const anchors = new Set<HTMLElement>()
    const nested = new Set<HTMLElement>()
    for (const t of targets) (t.role === "anchor" ? anchors : nested).add(t.el)

    // A5: elements that left this key's custody, and are still this key's.
    for (const el of [...rec.anchors, ...rec.nested]) {
      if (anchors.has(el) || nested.has(el)) continue
      if (owner.get(el) === key) strip(el)
    }

    const videoId: VideoId = keyVideoId(key)
    for (const el of anchors) {
      takeOver(el, key)
      el.dataset["boyoVid"] = videoId
      el.dataset["boyo"] = model.dataBoyo
      setPlate(el, model.plate)
    }
    for (const el of nested) {
      takeOver(el, key)
      // An element that was another card's anchor keeps nothing of that:
      // not the plate's values, not the self-tag (D6).
      clearPlate(el)
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
        if (owner.get(el) === key) strip(el)
      }
    }
    // Targets the runtime still associates with the key but this module
    // never stamped (a race between observation and realization): nothing
    // to strip, and never another key's stamp.
    for (const { el } of targets) {
      if (owner.get(el) === key && rec !== undefined) strip(el)
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
