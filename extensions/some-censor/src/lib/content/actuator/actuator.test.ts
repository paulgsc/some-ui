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

const INPUTS = {
  videoId: asVideoId("vid_a"),
  channelId: null,
  channelName: "Chan",
}
const PLATED: RenderModel = project(
  { kind: "plated", session: sessionOf(1) },
  INPUTS
)
const ABSENT: RenderModel = project(
  { kind: "absent", session: sessionOf(1) },
  INPUTS
)

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

function plateOf(el: HTMLElement): string {
  return el.style.getPropertyValue("--boyo-plate")
}

beforeEach(() => {
  document.body.innerHTML = ""
  actuator = createActuator()
})

afterEach(() => {
  actuator.dispose()
})

describe("render", () => {
  it("stamps the anchor and writes the plate's values on it", () => {
    const el = card()
    actuator.realize([render(K, PLATED, [{ el, role: "anchor" }])])

    expect(el.dataset["boyo"]).toBe("plated")
    expect(el.dataset["boyoVid"]).toBe("vid_a")
    expect(plateOf(el)).toBe(PLATED.plate?.fill)
    expect(el.style.getPropertyValue("--boyo-disc")).toBe(PLATED.plate?.disc)
    expect(el.style.getPropertyValue("--boyo-initial")).toBe('"C"')
    expect(el.children, "it mounts nothing in the card").toHaveLength(1)
  })

  it("is idempotent: the same render twice is the same DOM (A3)", () => {
    const el = card()
    const bound = [render(K, PLATED, [{ el, role: "anchor" }])]
    actuator.realize(bound)
    const before = el.outerHTML
    actuator.realize(bound)
    expect(el.outerHTML).toBe(before)
  })

  it("re-asserts a stamp and plate the vendor removed", () => {
    const el = card()
    actuator.realize([render(K, PLATED, [{ el, role: "anchor" }])])
    el.removeAttribute("style")
    delete el.dataset["boyo"]
    actuator.realize([render(K, PLATED, [{ el, role: "anchor" }])])
    expect(el.dataset["boyo"]).toBe("plated")
    expect(plateOf(el)).toBe(PLATED.plate?.fill)
  })

  it("clears the plate on a card that turns absent, and writes it back", () => {
    const el = card()
    actuator.realize([render(K, PLATED, [{ el, role: "anchor" }])])
    actuator.realize([render(K, ABSENT, [{ el, role: "anchor" }])])
    expect(el.dataset["boyo"]).toBe("absent")
    expect(el.hasAttribute("style"), "removed at once").toBe(false)
    actuator.realize([render(K, PLATED, [{ el, role: "anchor" }])])
    expect(plateOf(el)).toBe(PLATED.plate?.fill)
  })

  it("leaves the vendor's own inline style alone", () => {
    const el = card()
    el.style.position = "absolute"
    actuator.realize([render(K, PLATED, [{ el, role: "anchor" }])])
    actuator.realize([unmount(K)])
    expect(el.getAttribute("style")).toBe("position: absolute;")
  })

  it("stamps nested custody without plate values (D6)", () => {
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
    expect(nested.hasAttribute("style")).toBe(false)
    expect(plateOf(anchor)).not.toBe("")
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
    expect(plateOf(x), "K2's plate survives too").not.toBe("")

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
    expect(x.hasAttribute("style"), "and the plate").toBe(false)
    expect(actuator.custodyOf(K2)).toEqual([x])
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
    expect(anchor.hasAttribute("style"), "no trace of the plate").toBe(false)
    expect(nested.hasAttribute("data-boyo")).toBe(false)
    expect(actuator.custodyOf(K)).toEqual([])
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
    expect(el.hasAttribute("style")).toBe(false)
    actuator.realize([render(K, PLATED, [{ el, role: "anchor" }])])
    expect(el.hasAttribute("data-boyo"), "realize after dispose is inert").toBe(
      false
    )
  })
})
