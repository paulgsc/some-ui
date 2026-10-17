/**
 * The Actuator (BC4), fed synthetic `BoundAction[]`: no Core, no
 * Sensor. What it must do is write exactly what it was told, idempotently.
 */

import { cardKey } from "@censor/lib/content/core/keys"
import type { RenderModel } from "@censor/lib/content/fsm"
import { project } from "@censor/lib/content/fsm"
import { asVideoId } from "@censor/types/ids"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { Actuator } from "./actuator"
import { createActuator } from "./actuator"
import type { BoundAction, CustodyTarget } from "./bound"

const K = cardKey(asVideoId("vid_a"))
const K2 = cardKey(asVideoId("vid_b"))

const PLATED: RenderModel = project({ kind: "plated", session: sessionOf(1) })
const ABSENT: RenderModel = project({ kind: "absent", session: sessionOf(1) })

function sessionOf(n: number): Parameters<typeof project>[0]["session"] {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return n as unknown as Parameters<typeof project>[0]["session"]
}

let actuator: Actuator

function card(tag = "ytd-rich-item-renderer"): HTMLElement {
  const el = document.createElement(tag)
  el.innerHTML = '<a id="video-title" href="/watch?v=vid_a">t</a>'
  document.body.appendChild(el)
  return el
}

function render(
  key: typeof K,
  model: RenderModel,
  targets: ReadonlyArray<CustodyTarget>
): BoundAction {
  return { action: { kind: "render", key, model }, targets }
}

function unmount(
  key: typeof K,
  targets: ReadonlyArray<CustodyTarget> = []
): BoundAction {
  return { action: { kind: "unmount", key }, targets }
}

function veilOf(el: HTMLElement): HTMLElement | null {
  return el.querySelector(":scope > .boyo-veil")
}

beforeEach(() => {
  document.body.innerHTML = ""
  actuator = createActuator({ doc: document })
})

afterEach(() => {
  actuator.dispose()
})

describe("render", () => {
  it("stamps the anchor, anchors it, and mounts one veil (A1, A2)", () => {
    const el = card()
    actuator.realize([render(K, PLATED, [{ el, role: "anchor" }])])

    expect(el.dataset["boyo"]).toBe("plated")
    expect(el.dataset["boyoVid"]).toBe("vid_a")
    expect(el.style.position).toBe("relative")
    const veil = veilOf(el)
    expect(veil).not.toBeNull()
    expect(veil?.childNodes, "it carries nothing from the card").toHaveLength(0)
  })

  it("is idempotent: the same render twice is the same DOM (A3)", () => {
    const el = card()
    const bound = [render(K, PLATED, [{ el, role: "anchor" }])]
    actuator.realize(bound)
    const before = el.outerHTML
    const veil = veilOf(el)
    actuator.realize(bound)
    expect(el.outerHTML).toBe(before)
    expect(veilOf(el), "the very same veil node").toBe(veil)
    expect(el.querySelectorAll(".boyo-veil")).toHaveLength(1)
  })

  it("re-attaches a veil the vendor removed, without duplicating it (A2)", () => {
    const el = card()
    actuator.realize([render(K, PLATED, [{ el, role: "anchor" }])])
    veilOf(el)?.remove()
    delete el.dataset["boyo"]
    actuator.realize([render(K, PLATED, [{ el, role: "anchor" }])])
    expect(el.querySelectorAll(".boyo-veil")).toHaveLength(1)
    expect(el.dataset["boyo"], "the stamp is re-asserted too").toBe("plated")
  })

  it("replaces a veil the vendor reparented elsewhere, without duplicating it (A2)", () => {
    const el = card()
    actuator.realize([render(K, PLATED, [{ el, role: "anchor" }])])
    const moved = veilOf(el)
    if (moved === null) throw new Error("no veil mounted")
    document.body.appendChild(moved)
    expect(moved.isConnected, "still connected, just not here").toBe(true)
    actuator.realize([render(K, PLATED, [{ el, role: "anchor" }])])
    expect(veilOf(el), "the anchor has a veil of its own again").not.toBeNull()
    expect(veilOf(el)).not.toBe(moved)
    expect(
      document.querySelectorAll(".boyo-veil"),
      "the stray one is gone"
    ).toHaveLength(1)
  })

  it("puts no veil on an absent card, and mounts one when it is plated", () => {
    const el = card()
    actuator.realize([render(K, PLATED, [{ el, role: "anchor" }])])
    actuator.realize([render(K, ABSENT, [{ el, role: "anchor" }])])
    expect(el.dataset["boyo"]).toBe("absent")
    expect(veilOf(el), "removed at once").toBeNull()
    actuator.realize([render(K, PLATED, [{ el, role: "anchor" }])])
    expect(el.dataset["boyo"]).toBe("plated")
    expect(el.querySelectorAll(".boyo-veil")).toHaveLength(1)
  })

  it("leaves an anchor's inline position alone when it was already positioned", () => {
    const el = card()
    el.style.position = "absolute"
    actuator.realize([render(K, PLATED, [{ el, role: "anchor" }])])
    expect(el.style.position).toBe("absolute")
    actuator.realize([unmount(K)])
    expect(el.style.position).toBe("absolute")
  })

  it("stamps nested custody without a veil (D6)", () => {
    const anchor = card("yt-lockup-view-model")
    const nested = document.createElement("ytd-rich-item-renderer")
    document.body.appendChild(nested)
    actuator.realize([
      render(K, PLATED, [
        { el: anchor, role: "anchor" },
        { el: nested, role: "nested" },
      ]),
    ])
    expect(nested.dataset["boyo"]).toBe("plated")
    expect(nested.dataset["boyoVid"]).toBeUndefined()
    expect(veilOf(nested)).toBeNull()
    expect(veilOf(anchor)).not.toBeNull()
    expect(actuator.custodyOf(K)).toEqual([anchor, nested])
  })
})

describe("custody accounting (A5)", () => {
  it("strips an element that left the key's custody", () => {
    const anchor = card()
    const nested = document.createElement("yt-lockup-view-model")
    document.body.appendChild(nested)
    actuator.realize([
      render(K, PLATED, [
        { el: anchor, role: "anchor" },
        { el: nested, role: "nested" },
      ]),
    ])
    actuator.realize([render(K, PLATED, [{ el: anchor, role: "anchor" }])])
    expect(nested.hasAttribute("data-boyo"), "left custody, stamp gone").toBe(
      false
    )
    expect(anchor.dataset["boyo"]).toBe("plated")
  })

  it("never strips a stamp another key now owns, whichever render runs first", () => {
    const x = card()
    actuator.realize([render(K, ABSENT, [{ el: x, role: "anchor" }])])
    // x moves to K2. K2 renders first, then K learns x is gone.
    actuator.realize([render(K2, PLATED, [{ el: x, role: "anchor" }])])
    actuator.realize([render(K, ABSENT, [])])
    expect(x.dataset["boyoVid"], "K2's stamp survives K's diff").toBe("vid_b")
    expect(x.dataset["boyo"]).toBe("plated")
    expect(x.querySelectorAll(".boyo-veil"), "one veil, K2's").toHaveLength(1)

    // The other order: K learns first, then K2 takes over.
    const y = card()
    actuator.realize([render(K, PLATED, [{ el: y, role: "anchor" }])])
    actuator.realize([render(K, PLATED, [])])
    expect(y.hasAttribute("data-boyo")).toBe(false)
    actuator.realize([render(K2, PLATED, [{ el: y, role: "anchor" }])])
    expect(y.dataset["boyoVid"]).toBe("vid_b")
  })

  it("takes over another key's anchor as nested custody with nothing of the anchor left (D6)", () => {
    const x = card()
    actuator.realize([render(K, PLATED, [{ el: x, role: "anchor" }])])
    expect(x.dataset["boyoVid"]).toBe("vid_a")
    actuator.realize([render(K2, ABSENT, [{ el: x, role: "nested" }])])
    expect(x.dataset["boyoVid"], "the old self-tag is gone").toBeUndefined()
    expect(x.dataset["boyo"]).toBe("absent")
    expect(veilOf(x)).toBeNull()
    expect(x.style.position).toBe("")
    expect(actuator.custodyOf(K2)).toEqual([x])
  })

  it("demotes an anchor to nested custody by removing its veil", () => {
    const el = card()
    actuator.realize([render(K, PLATED, [{ el, role: "anchor" }])])
    actuator.realize([render(K, PLATED, [{ el, role: "nested" }])])
    expect(veilOf(el)).toBeNull()
    expect(el.dataset["boyo"]).toBe("plated")
    expect(el.dataset["boyoVid"]).toBeUndefined()
  })
})

describe("unmount (A4)", () => {
  it("leaves every stamped element as it was", () => {
    const anchor = card()
    const nested = document.createElement("yt-lockup-view-model")
    document.body.appendChild(nested)
    actuator.realize([
      render(K, PLATED, [
        { el: anchor, role: "anchor" },
        { el: nested, role: "nested" },
      ]),
    ])
    actuator.realize([unmount(K)])
    expect(anchor.hasAttribute("data-boyo")).toBe(false)
    expect(anchor.hasAttribute("data-boyo-vid")).toBe(false)
    expect(veilOf(anchor)).toBeNull()
    expect(nested.hasAttribute("data-boyo")).toBe(false)
    expect(actuator.custodyOf(K)).toEqual([])
  })

  it("restores the anchoring position it wrote (A1, A4)", () => {
    const el = card()
    actuator.realize([render(K, PLATED, [{ el, role: "anchor" }])])
    expect(el.style.position).toBe("relative")
    actuator.realize([unmount(K)])
    expect(el.style.position).toBe("")
    expect(el.hasAttribute("style"), "no trace of the write").toBe(false)

    // Demotion to nested custody is not an anchor either.
    actuator.realize([render(K, PLATED, [{ el, role: "anchor" }])])
    actuator.realize([render(K, PLATED, [{ el, role: "nested" }])])
    expect(el.style.position).toBe("")
  })

  it("restores an inline position's priority along with its value", () => {
    const el = card()
    el.style.setProperty("position", "static", "important")
    actuator.realize([render(K, PLATED, [{ el, role: "anchor" }])])
    expect(el.style.position, "anchored over the vendor's static").toBe(
      "relative"
    )
    actuator.realize([unmount(K)])
    expect(el.style.getPropertyValue("position")).toBe("static")
    expect(el.style.getPropertyPriority("position")).toBe("important")
  })

  it("keeps a vendor's `relative !important` written over the anchoring", () => {
    const el = card()
    actuator.realize([render(K, PLATED, [{ el, role: "anchor" }])])
    el.style.setProperty("position", "relative", "important")
    actuator.realize([unmount(K)])
    expect(el.style.getPropertyValue("position")).toBe("relative")
    expect(el.style.getPropertyPriority("position")).toBe("important")
  })

  it("re-anchoring over a value the vendor took back restores that value", () => {
    const el = card()
    actuator.realize([render(K, PLATED, [{ el, role: "anchor" }])])
    el.style.position = "static"
    actuator.realize([render(K, ABSENT, [{ el, role: "anchor" }])])
    expect(el.style.position, "anchored again").toBe("relative")
    actuator.realize([unmount(K)])
    expect(el.style.position, "the vendor's later static, not none").toBe(
      "static"
    )
  })

  it("keeps an inline position the vendor wrote after the anchoring", () => {
    const el = card()
    actuator.realize([render(K, PLATED, [{ el, role: "anchor" }])])
    expect(el.style.position).toBe("relative")
    el.style.position = "absolute"
    actuator.realize([unmount(K)])
    expect(el.style.position, "the vendor's later value is not undone").toBe(
      "absolute"
    )
  })

  it("is a no-op for a key it never realized", () => {
    const el = card()
    actuator.realize([render(K2, PLATED, [{ el, role: "anchor" }])])
    actuator.realize([unmount(K, [{ el, role: "anchor" }])])
    expect(el.dataset["boyoVid"], "another key's stamp is not touched").toBe(
      "vid_b"
    )
  })
})

describe("dispose", () => {
  it("strips everything, and is inert afterwards", () => {
    const el = card()
    actuator.realize([render(K, PLATED, [{ el, role: "anchor" }])])
    actuator.dispose()
    expect(el.hasAttribute("data-boyo")).toBe(false)
    expect(veilOf(el)).toBeNull()
    expect(el.hasAttribute("style")).toBe(false)
    actuator.realize([render(K, PLATED, [{ el, role: "anchor" }])])
    expect(el.hasAttribute("data-boyo"), "realize after dispose is inert").toBe(
      false
    )
  })
})
