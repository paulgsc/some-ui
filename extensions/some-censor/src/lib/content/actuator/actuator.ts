/**
 * The Actuator (BC4) — Boundary Contract B7: the only writer.
 *
 * `realize(actions)` executes what Core named and decides nothing. It is
 * the one module that mutates VendorDOM (stamps and the plate's values);
 * every such write lives here or in a file this module owns (`switch.ts`
 * for the page-wide off switch, `watch-hold.ts` for the watch page's hold).
 * Nothing it does produces an input for Core but the face control's hold
 * (`face-hold.ts`, QD13), the one gesture Core hears, which it reports
 * through `ports.onFace`.
 *
 * Design properties, pinned by `actuator.test.ts` (labels for citation, not
 * declared review invariants). The parenthesised D-numbers are the veil
 * ledger's labels, kept so citations elsewhere resolve. D6 is nested
 * custody: an element inside an anchor that matches a pre-mask rule of its
 * own gets `data-boyo` so the occluder releases it, and no plate values.
 *
 *   A1, A2 and A6 — retired with the veil (#1804).
 *   A3 — Idempotent (D2). Realizing the same actions twice leaves the same
 *        DOM: a render whose model and targets are unchanged re-asserts the
 *        stamps and the plate's values, and touches nothing else.
 *   A4 — Full cleanup (D3, D4). `unmount` leaves every element it stamped
 *        as it was before (stamps and the plate's values) and drops the
 *        key's record; `dispose` does so for everything at once, and
 *        lifts the watch page's hold (`watch-hold.ts`'s WH2).
 *   A5 — Custody is accounted for here, once (D6). Which elements carry which
 *        key's stamp is one map in
 *        this module; a render diffs its targets against it and strips the
 *        elements that left — but only those this key still owns, so an
 *        element that moved to another card keeps that card's stamp
 *        whichever render runs first.
 *   A7 — The course is its own stamps (R12). `course` writes
 *        `data-boyo-course` and `data-boyo-stop` on the rows it is handed,
 *        takes them off every row it marked before and is not handed now,
 *        and `dispose` takes them off every row. A card's stamps and the
 *        course's never touch each other.
 */

import type { CardKey } from "@censor/lib/content/core/keys"
import { keyVideoId } from "@censor/lib/content/core/keys"
import type { RenderModel } from "@censor/lib/content/fsm"
import type { Plate } from "@censor/lib/content/plate/plate"
import type { VideoId } from "@censor/types/ids"

import type { BoundAction, CustodyTarget, MarkedRow } from "./bound"
import { createWatchHold } from "./watch-hold"

export type Actuator = {
  realize(actions: ReadonlyArray<BoundAction>): void
  /** Mark the playlist's rows, and only these (A7). */
  course(rows: ReadonlyArray<MarkedRow>): void
  /** Stamps a key currently holds, for the debug layer. */
  custodyOf(key: CardKey): ReadonlyArray<HTMLElement>
  dispose(): void
}

type Realized = {
  anchors: Set<HTMLElement>
  nested: Set<HTMLElement>
}

/** The plate's custom properties, namespaced so A4 can simply remove them. */
const PLATE_PROPERTIES: Readonly<Record<keyof Plate, string>> = {
  fill: "--boyo-plate",
  disc: "--boyo-disc",
  initial: "--boyo-initial",
}

/** A card's link to its own watch page. */
const WATCH_LINK = 'a[href*="/watch?v="]'

export type ActuatorPorts = {
  /** The owner held the face control on `videoId`'s page (QD13). */
  readonly onFace: (videoId: VideoId, shown: boolean) => void
}

export function createActuator(doc: Document, ports: ActuatorPorts): Actuator {
  const realized = new Map<CardKey, Realized>()
  const watchHold = createWatchHold(doc, ports.onFace)
  const owner = new WeakMap<HTMLElement, CardKey>()
  /** Elements whose `style` attribute this module created, so A4 removes only those. */
  const styled = new WeakSet<HTMLElement>()
  let disposed = false

  function setPlate(el: HTMLElement, plate: Plate | null): void {
    if (plate === null) {
      clearPlate(el)
      return
    }
    if (!el.hasAttribute("style")) styled.add(el)
    el.style.setProperty(PLATE_PROPERTIES.fill, plate.fill)
    el.style.setProperty(PLATE_PROPERTIES.disc, plate.disc)
    // A CSS string for `content`: the letter is never a quote or a backslash.
    el.style.setProperty(PLATE_PROPERTIES.initial, `"${plate.initial}"`)
  }

  function clearPlate(el: HTMLElement): void {
    for (const property of Object.values(PLATE_PROPERTIES)) {
      el.style.removeProperty(property)
    }
    if (styled.has(el) && el.getAttribute("style") === "") {
      el.removeAttribute("style")
    }
    styled.delete(el)
  }

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

  // ── The course (R12) ───────────────────────────────────────────────────

  /** Rows that carry a course stamp now. */
  let marked = new Set<HTMLElement>()

  function unmark(el: HTMLElement): void {
    delete el.dataset["boyoCourse"]
    delete el.dataset["boyoStop"]
  }

  function course(rows: ReadonlyArray<MarkedRow>): void {
    const next = new Set<HTMLElement>()
    for (const { el, mark } of rows) {
      if (mark === null) continue
      next.add(el)
      // A3: an unchanged mark is not written again.
      if (el.dataset["boyoCourse"] !== mark.place) {
        el.dataset["boyoCourse"] = mark.place
      }
      if (!mark.stop) delete el.dataset["boyoStop"]
      else el.dataset["boyoStop"] ??= ""
    }
    for (const el of marked) if (!next.has(el)) unmark(el)
    marked = next
  }

  // ── Skip (#1966) ───────────────────────────────────────────────────────

  let pendingPlay: ReturnType<typeof setTimeout> | null = null

  /**
   * Open the card as a click on its watch link would, a task after the
   * held navigation that asked for it, so YouTube's own navigation starts
   * from an event it handles whole. A click carries no autoplay mark, so
   * the Sensor never holds it.
   */
  function play(targets: ReadonlyArray<CustodyTarget>): void {
    const card = targets[0]?.el
    if (card === undefined) return
    const link = card.matches(WATCH_LINK)
      ? card
      : card.querySelector<HTMLElement>(WATCH_LINK)
    if (link === null) return
    if (pendingPlay !== null) clearTimeout(pendingPlay)
    // Lifetime: cleared by dispose(), and by the next play.
    pendingPlay = setTimeout(() => {
      pendingPlay = null
      link.click()
    }, 0)
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
          case "play": {
            play(targets)
            break
          }
          case "watch": {
            watchHold.realize(action, targets[0]?.el ?? null)
            break
          }
          default: {
            kind satisfies never
            throw new Error("[BOYO] unknown action", { cause: action })
          }
        }
      }
    },

    course(rows: ReadonlyArray<MarkedRow>): void {
      if (!disposed) course(rows)
    },

    custodyOf(key: CardKey): ReadonlyArray<HTMLElement> {
      const rec = realized.get(key)
      return rec === undefined ? [] : [...rec.anchors, ...rec.nested]
    },

    dispose(): void {
      if (disposed) return
      disposed = true
      for (const key of [...realized.keys()]) unmount(key, [])
      course([])
      watchHold.dispose()
      if (pendingPlay !== null) clearTimeout(pendingPlay)
      pendingPlay = null
    },
  }
}
