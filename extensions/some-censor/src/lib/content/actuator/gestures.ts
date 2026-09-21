/**
 * Gesture delegation (BC4, #1437) — `events.ts`, re-homed.
 *
 * One capture-phase listener per event type on the document. A click that
 * lands on a veil walks up to the anchor the Actuator stamped
 * (`data-boyo-vid` — a self-tag, Definition 7.3: the Actuator reading what
 * it wrote, never the vendor's markup) and becomes an `Input` for Core.
 * Single versus double click is decided by a `ClickGate` per card, exactly
 * as `VideoEntry` decided it per entry.
 *
 * Owned by the Actuator rather than the Sensor because the veil is the
 * Actuator's node: a gesture on it is the extension's own artifact
 * reporting, not an observation of VendorDOM.
 */

import type { Gesture, Input } from "@censor/lib/content/core/events"
import type { CardKey } from "@censor/lib/content/core/keys"
import { cardKey } from "@censor/lib/content/core/keys"
import { SEL } from "@censor/lib/content/selectors"
import { asVideoId } from "@censor/types/ids"
import { ClickGate } from "@some-extension/common"

export type GesturePorts = {
  readonly inbox: (input: Input) => void
  readonly clock: () => number
  /** `confirm()`, injectable so a test need not stub a global. */
  readonly confirmWhitelist: () => boolean
}

export type GestureDelegation = {
  /** Cancel a card's staged single click (its veil is going away). */
  forget(key: CardKey): void
  /** Detach every listener and cancel every staged click. */
  dispose(): void
}

export function attachGestures(
  doc: Document,
  ports: GesturePorts
): GestureDelegation {
  const gates = new Map<CardKey, ClickGate<Gesture>>()

  const gateFor = (key: CardKey): ClickGate<Gesture> => {
    let gate = gates.get(key)
    if (gate === undefined) {
      gate = new ClickGate<Gesture>(
        (gesture) =>
          ports.inbox({ kind: "gesture", key, gesture, t: ports.clock() }),
        { single: "click", double: "dblclick" }
      )
      gates.set(key, gate)
    }
    return gate
  }

  const onClick = (e: Event): void => {
    const key = veilKey(e.target)
    if (key === null) return
    e.preventDefault()
    e.stopImmediatePropagation()
    gateFor(key).rawClick()
  }
  const onDblClick = (e: Event): void => {
    const key = veilKey(e.target)
    if (key === null) return
    e.preventDefault()
    e.stopImmediatePropagation()
    gateFor(key).rawDblClick()
  }
  const onContextMenu = (e: Event): void => {
    const key = veilKey(e.target)
    if (key === null) return
    e.preventDefault()
    if (ports.confirmWhitelist()) {
      ports.inbox({ kind: "whitelist-request", key, t: ports.clock() })
    }
  }

  doc.addEventListener("click", onClick, { capture: true })
  doc.addEventListener("dblclick", onDblClick, { capture: true })
  doc.addEventListener("contextmenu", onContextMenu, { capture: true })

  return {
    forget(key: CardKey): void {
      gates.get(key)?.destroy()
      gates.delete(key)
    },
    dispose(): void {
      doc.removeEventListener("click", onClick, { capture: true })
      doc.removeEventListener("dblclick", onDblClick, { capture: true })
      doc.removeEventListener("contextmenu", onContextMenu, { capture: true })
      for (const gate of gates.values()) gate.destroy()
      gates.clear()
    },
  }
}

/**
 * Walk up from an event target to the nearest veil, then to the anchor it
 * sits in, and read the key the Actuator stamped there.
 */
function veilKey(target: EventTarget | null): CardKey | null {
  if (!(target instanceof Element)) return null
  const veil = target.closest(".boyo-veil")
  if (!veil) return null
  const anchor = veil.closest(SEL)
  if (!(anchor instanceof HTMLElement)) return null
  const vid = anchor.dataset["boyoVid"]
  return vid ? cardKey(asVideoId(vid)) : null
}
