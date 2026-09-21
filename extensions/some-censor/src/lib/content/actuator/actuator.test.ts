/**
 * The Actuator (BC4, #1437), fed synthetic `BoundAction[]`: no Core, no
 * Sensor, a stub background. What it must do is write exactly what it was
 * told, idempotently, and route every answer back through the inbox.
 */

import { WHITELIST_REVEAL_DELAY_MS } from "@censor/lib/content/core/actions"
import type { Input } from "@censor/lib/content/core/events"
import { cardKey } from "@censor/lib/content/core/keys"
import type { RenderModel } from "@censor/lib/content/fsm"
import { project } from "@censor/lib/content/fsm"
import { asChannelId, asVideoId } from "@censor/types/ids"
import type { BgRequest } from "@censor/types/messages"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Actuator } from "./actuator"
import { createActuator, VEIL_EXIT_FALLBACK_MS } from "./actuator"
import type { BoundAction, CustodyTarget } from "./bound"

const K = cardKey(asVideoId("vid_a"))
const K2 = cardKey(asVideoId("vid_b"))

const MASKED: RenderModel = project({ kind: "masked", session: sessionOf(1) })
const META: RenderModel = project({
  kind: "meta",
  session: sessionOf(1),
  meta: { channelName: "Chan", duration: "1:23", uploadDate: "3 days ago" },
})
const REVEALED: RenderModel = project({
  kind: "revealed",
  session: sessionOf(1),
})
const WHITELISTED: RenderModel = project({
  kind: "whitelisted",
  session: sessionOf(1),
})

function sessionOf(n: number): Parameters<typeof project>[0]["session"] {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return n as unknown as Parameters<typeof project>[0]["session"]
}

let inbox: Array<Input>
let sent: Array<BgRequest>
/** What the stub background answers next; `null` makes it reject. */
let answer: unknown
let titleHook: unknown
let confirmAnswer: boolean
let actuator: Actuator
let now: number

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
  vi.useFakeTimers()
  document.body.innerHTML = ""
  inbox = []
  sent = []
  now = 1000
  answer = { ok: true, whitelisted: false }
  titleHook = undefined
  confirmAnswer = true
  actuator = createActuator({
    doc: document,
    inbox: (i) => inbox.push(i),
    clock: () => now,
    onFact: () => {},
    sendMessage: (msg: BgRequest): Promise<unknown> => {
      sent.push(msg)
      return answer === null
        ? Promise.reject(new Error("worker gone"))
        : Promise.resolve(answer)
    },
    titleHook: () => titleHook,
    confirmWhitelist: () => confirmAnswer,
  })
})

afterEach(() => {
  actuator.dispose()
  vi.useRealTimers()
})

describe("render", () => {
  it("stamps the anchor, anchors it, and mounts one veil (A1, A2)", () => {
    const el = card()
    actuator.realize([render(K, MASKED, [{ el, role: "anchor" }])])

    expect(el.dataset["boyo"]).toBe("0")
    expect(el.dataset["boyoVid"]).toBe("vid_a")
    expect(el.style.position).toBe("relative")
    const veil = veilOf(el)
    expect(veil).not.toBeNull()
    expect(veil?.textContent).toContain("Click to preview")
  })

  it("is idempotent: the same render twice is the same DOM (A3)", () => {
    const el = card()
    const bound = [render(K, MASKED, [{ el, role: "anchor" }])]
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
    actuator.realize([render(K, MASKED, [{ el, role: "anchor" }])])
    veilOf(el)?.remove()
    delete el.dataset["boyo"]
    actuator.realize([render(K, MASKED, [{ el, role: "anchor" }])])
    expect(el.querySelectorAll(".boyo-veil")).toHaveLength(1)
    expect(el.dataset["boyo"], "the stamp is re-asserted too").toBe("0")
  })

  it("replaces a veil the vendor reparented elsewhere, without duplicating it (A2)", () => {
    const el = card()
    actuator.realize([render(K, MASKED, [{ el, role: "anchor" }])])
    const moved = veilOf(el)
    if (moved === null) throw new Error("no veil mounted")
    document.body.appendChild(moved)
    expect(moved.isConnected, "still connected, just not here").toBe(true)
    actuator.realize([render(K, MASKED, [{ el, role: "anchor" }])])
    expect(veilOf(el), "the anchor has a veil of its own again").not.toBeNull()
    expect(veilOf(el)).not.toBe(moved)
    expect(
      document.querySelectorAll(".boyo-veil"),
      "the stray one is gone"
    ).toHaveLength(1)
  })

  it("rebuilds the veil's content when the model changes", () => {
    const el = card()
    actuator.realize([render(K, MASKED, [{ el, role: "anchor" }])])
    actuator.realize([render(K, META, [{ el, role: "anchor" }])])
    expect(el.dataset["boyo"]).toBe("1")
    expect(veilOf(el)?.textContent).toContain("Chan")
    expect(veilOf(el)?.textContent).toContain("1:23 · 3 days ago")
    expect(el.querySelectorAll(".boyo-veil")).toHaveLength(1)
  })

  it("animates the veil out on reveal, and removes it within the fallback", () => {
    const el = card()
    actuator.realize([render(K, MASKED, [{ el, role: "anchor" }])])
    actuator.realize([render(K, REVEALED, [{ el, role: "anchor" }])])
    expect(el.dataset["boyo"]).toBe("3")
    expect(veilOf(el), "still there, animating").not.toBeNull()
    vi.advanceTimersByTime(VEIL_EXIT_FALLBACK_MS)
    expect(veilOf(el), "gone").toBeNull()
    // A later render of the same revealed model mounts nothing.
    actuator.realize([render(K, REVEALED, [{ el, role: "anchor" }])])
    expect(veilOf(el)).toBeNull()
  })

  it("replaces a veil still animating out when the card is remasked (A2)", () => {
    const el = card()
    actuator.realize([render(K, MASKED, [{ el, role: "anchor" }])])
    actuator.realize([render(K, REVEALED, [{ el, role: "anchor" }])])
    const exiting = veilOf(el)
    actuator.realize([render(K, MASKED, [{ el, role: "anchor" }])])
    const veils = el.querySelectorAll(".boyo-veil")
    expect(veils, "the exiting veil is gone at once").toHaveLength(1)
    expect(veils[0]).not.toBe(exiting)
    expect(veils[0]?.textContent).toContain("Click to preview")
    // Neither the old exit's fallback nor its animation end takes the new one.
    exiting?.dispatchEvent(new Event("animationend"))
    vi.advanceTimersByTime(VEIL_EXIT_FALLBACK_MS)
    expect(el.querySelectorAll(".boyo-veil")).toHaveLength(1)
    expect(veilOf(el)).toBe(veils[0])
  })

  it("leaves an anchor's inline position alone when it was already positioned", () => {
    const el = card()
    el.style.position = "absolute"
    actuator.realize([render(K, MASKED, [{ el, role: "anchor" }])])
    expect(el.style.position).toBe("absolute")
    actuator.realize([unmount(K)])
    expect(el.style.position).toBe("absolute")
  })

  it("stamps nested custody without a veil (D6)", () => {
    const anchor = card("yt-lockup-view-model")
    const nested = document.createElement("ytd-rich-item-renderer")
    document.body.appendChild(nested)
    actuator.realize([
      render(K, MASKED, [
        { el: anchor, role: "anchor" },
        { el: nested, role: "nested" },
      ]),
    ])
    expect(nested.dataset["boyo"]).toBe("0")
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
      render(K, MASKED, [
        { el: anchor, role: "anchor" },
        { el: nested, role: "nested" },
      ]),
    ])
    actuator.realize([render(K, MASKED, [{ el: anchor, role: "anchor" }])])
    expect(nested.hasAttribute("data-boyo"), "left custody, stamp gone").toBe(
      false
    )
    expect(anchor.dataset["boyo"]).toBe("0")
  })

  it("never strips a stamp another key now owns, whichever render runs first", () => {
    const x = card()
    actuator.realize([render(K, MASKED, [{ el: x, role: "anchor" }])])
    // x moves to K2. K2 renders first, then K learns x is gone.
    actuator.realize([render(K2, META, [{ el: x, role: "anchor" }])])
    actuator.realize([render(K, MASKED, [])])
    expect(x.dataset["boyoVid"], "K2's stamp survives K's diff").toBe("vid_b")
    expect(x.dataset["boyo"]).toBe("1")
    expect(x.querySelectorAll(".boyo-veil"), "one veil, K2's").toHaveLength(1)

    // The other order: K learns first, then K2 takes over.
    const y = card()
    actuator.realize([render(K, MASKED, [{ el: y, role: "anchor" }])])
    actuator.realize([render(K, MASKED, [])])
    expect(y.hasAttribute("data-boyo")).toBe(false)
    actuator.realize([render(K2, META, [{ el: y, role: "anchor" }])])
    expect(y.dataset["boyoVid"]).toBe("vid_b")
  })

  it("takes over another key's anchor as nested custody with nothing of the anchor left (D6)", () => {
    const x = card()
    actuator.realize([render(K, MASKED, [{ el: x, role: "anchor" }])])
    expect(x.dataset["boyoVid"]).toBe("vid_a")
    actuator.realize([render(K2, META, [{ el: x, role: "nested" }])])
    expect(x.dataset["boyoVid"], "the old self-tag is gone").toBeUndefined()
    expect(x.dataset["boyo"]).toBe("1")
    expect(veilOf(x)).toBeNull()
    expect(x.style.position).toBe("")
    expect(actuator.custodyOf(K2)).toEqual([x])
  })

  it("demotes an anchor to nested custody by removing its veil", () => {
    const el = card()
    actuator.realize([render(K, MASKED, [{ el, role: "anchor" }])])
    actuator.realize([render(K, MASKED, [{ el, role: "nested" }])])
    expect(veilOf(el)).toBeNull()
    expect(el.dataset["boyo"]).toBe("0")
    expect(el.dataset["boyoVid"]).toBeUndefined()
  })
})

describe("unmount (A4)", () => {
  it("leaves every stamped element as it was, and cancels the key's timers", () => {
    const anchor = card()
    const nested = document.createElement("yt-lockup-view-model")
    document.body.appendChild(nested)
    actuator.realize([
      render(K, WHITELISTED, [
        { el: anchor, role: "anchor" },
        { el: nested, role: "nested" },
      ]),
      {
        action: {
          kind: "schedule",
          key: K,
          generation: 0,
          version: 1,
          delayMs: WHITELIST_REVEAL_DELAY_MS,
        },
      },
    ])
    actuator.realize([unmount(K)])
    expect(anchor.hasAttribute("data-boyo")).toBe(false)
    expect(anchor.hasAttribute("data-boyo-vid")).toBe(false)
    expect(veilOf(anchor)).toBeNull()
    expect(nested.hasAttribute("data-boyo")).toBe(false)
    expect(actuator.custodyOf(K)).toEqual([])

    vi.advanceTimersByTime(WHITELIST_REVEAL_DELAY_MS * 2)
    expect(inbox.filter((i) => i.kind === "timer")).toEqual([])
  })

  it("restores the anchoring position it wrote (A1, A4)", () => {
    const el = card()
    actuator.realize([render(K, MASKED, [{ el, role: "anchor" }])])
    expect(el.style.position).toBe("relative")
    actuator.realize([unmount(K)])
    expect(el.style.position).toBe("")
    expect(el.hasAttribute("style"), "no trace of the write").toBe(false)

    // Demotion to nested custody is not an anchor either.
    actuator.realize([render(K, MASKED, [{ el, role: "anchor" }])])
    actuator.realize([render(K, MASKED, [{ el, role: "nested" }])])
    expect(el.style.position).toBe("")
  })

  it("restores an inline position's priority along with its value", () => {
    const el = card()
    el.style.setProperty("position", "static", "important")
    actuator.realize([render(K, MASKED, [{ el, role: "anchor" }])])
    expect(el.style.position, "anchored over the vendor's static").toBe(
      "relative"
    )
    actuator.realize([unmount(K)])
    expect(el.style.getPropertyValue("position")).toBe("static")
    expect(el.style.getPropertyPriority("position")).toBe("important")
  })

  it("keeps a vendor's `relative !important` written over the anchoring", () => {
    const el = card()
    actuator.realize([render(K, MASKED, [{ el, role: "anchor" }])])
    el.style.setProperty("position", "relative", "important")
    actuator.realize([unmount(K)])
    expect(el.style.getPropertyValue("position")).toBe("relative")
    expect(el.style.getPropertyPriority("position")).toBe("important")
  })

  it("re-anchoring over a value the vendor took back restores that value", () => {
    const el = card()
    actuator.realize([render(K, MASKED, [{ el, role: "anchor" }])])
    el.style.position = "static"
    actuator.realize([render(K, META, [{ el, role: "anchor" }])])
    expect(el.style.position, "anchored again").toBe("relative")
    actuator.realize([unmount(K)])
    expect(el.style.position, "the vendor's later static, not none").toBe(
      "static"
    )
  })

  it("keeps an inline position the vendor wrote after the anchoring", () => {
    const el = card()
    actuator.realize([render(K, MASKED, [{ el, role: "anchor" }])])
    expect(el.style.position).toBe("relative")
    el.style.position = "absolute"
    actuator.realize([unmount(K)])
    expect(el.style.position, "the vendor's later value is not undone").toBe(
      "absolute"
    )
  })

  it("removes a veil still animating out, without waiting for it", () => {
    const el = card()
    actuator.realize([render(K, MASKED, [{ el, role: "anchor" }])])
    actuator.realize([render(K, REVEALED, [{ el, role: "anchor" }])])
    expect(veilOf(el), "exiting").not.toBeNull()
    actuator.realize([unmount(K)])
    expect(veilOf(el), "gone at once, no animationend needed").toBeNull()
    expect(el.hasAttribute("style")).toBe(false)
  })

  it("is a no-op for a key it never realized", () => {
    const el = card()
    actuator.realize([render(K2, MASKED, [{ el, role: "anchor" }])])
    actuator.realize([unmount(K, [{ el, role: "anchor" }])])
    expect(el.dataset["boyoVid"], "another key's stamp is not touched").toBe(
      "vid_b"
    )
  })
})

describe("effects and their answers", () => {
  it("asks the background about a channel and routes the verdict to the inbox", async () => {
    answer = { ok: true, whitelisted: true }
    actuator.realize([
      {
        action: {
          kind: "query-whitelist",
          key: K,
          generation: 0,
          query: 1,
          channelId: asChannelId("@chan"),
        },
      },
    ])
    await vi.advanceTimersByTimeAsync(0)
    expect(sent).toEqual([{ type: "IS_WHITELISTED", channelId: "@chan" }])
    expect(inbox).toEqual([
      {
        kind: "whitelist-answer",
        key: K,
        generation: 0,
        query: 1,
        channelId: "@chan",
        whitelisted: true,
        t: 1000,
      },
    ])
  })

  it("answers false when the background fails", async () => {
    answer = null
    actuator.realize([
      {
        action: {
          kind: "query-whitelist",
          key: K,
          generation: 0,
          query: 1,
          channelId: asChannelId("@chan"),
        },
      },
    ])
    await vi.advanceTimersByTimeAsync(0)
    expect(inbox[0]).toMatchObject({
      kind: "whitelist-answer",
      whitelisted: false,
    })
  })

  it("persists a whitelist entry", async () => {
    actuator.realize([
      {
        action: {
          kind: "persist-whitelist",
          channelId: asChannelId("@chan"),
          channelName: "Chan",
        },
      },
    ])
    await vi.advanceTimersByTimeAsync(0)
    expect(sent).toEqual([
      { type: "ADD_WHITELIST", channelId: "@chan", channelName: "Chan" },
    ])
    expect(inbox).toEqual([])
  })

  it("runs the title hook and returns a string result with its version", async () => {
    titleHook = (title: string, channelId: string): string =>
      `${title} (${channelId})`
    actuator.realize([
      {
        action: {
          kind: "transform-title",
          key: K,
          generation: 0,
          version: 2,
          text: "T",
          channelId: asChannelId("@chan"),
        },
      },
    ])
    await vi.advanceTimersByTimeAsync(0)
    expect(inbox).toEqual([
      {
        kind: "title-transformed",
        key: K,
        generation: 0,
        version: 2,
        text: "T (@chan)",
        translated: true,
        t: 1000,
      },
    ])
  })

  it("ignores a hook that is missing, returns a non-string, or throws", async () => {
    for (const hook of [
      undefined,
      (): number => 42,
      (): never => {
        throw new Error("x")
      },
    ]) {
      titleHook = hook
      actuator.realize([
        {
          action: {
            kind: "transform-title",
            key: K,
            generation: 0,
            version: 1,
            text: "T",
            channelId: null,
          },
        },
      ])
      await vi.advanceTimersByTimeAsync(0)
    }
    expect(inbox).toEqual([])
  })

  it("fires a scheduled timer with the generation and version it was issued under", () => {
    actuator.realize([
      {
        action: {
          kind: "schedule",
          key: K,
          generation: 0,
          version: 3,
          delayMs: 1800,
        },
      },
    ])
    vi.advanceTimersByTime(1799)
    expect(inbox).toEqual([])
    now = 2800
    vi.advanceTimersByTime(1)
    expect(inbox).toEqual([
      { kind: "timer", key: K, generation: 0, version: 3, t: 2800 },
    ])
  })

  it("forwards facts to the recorder", () => {
    const facts: Array<unknown> = []
    const a = createActuator({
      doc: document,
      inbox: () => {},
      clock: () => 0,
      onFact: (f) => facts.push(f),
      sendMessage: () => Promise.resolve({}),
      titleHook: () => undefined,
      confirmWhitelist: () => false,
    })
    a.realize([{ action: { kind: "record", fact: { kind: "navigation" } } }])
    expect(facts).toEqual([{ kind: "navigation" }])
    a.dispose()
  })
})

describe("gestures", () => {
  function clickVeil(
    el: HTMLElement,
    type: "click" | "dblclick" | "contextmenu"
  ): void {
    veilOf(el)?.dispatchEvent(
      new MouseEvent(type, { bubbles: true, cancelable: true })
    )
  }

  it("commits a single click after the double-click window", () => {
    const el = card()
    actuator.realize([render(K, MASKED, [{ el, role: "anchor" }])])
    clickVeil(el, "click")
    expect(inbox).toEqual([])
    vi.advanceTimersByTime(400)
    expect(inbox).toEqual([
      { kind: "gesture", key: K, gesture: "click", t: 1000 },
    ])
  })

  it("commits a double click immediately, swallowing the staged single", () => {
    const el = card()
    actuator.realize([render(K, MASKED, [{ el, role: "anchor" }])])
    clickVeil(el, "click")
    clickVeil(el, "click")
    clickVeil(el, "dblclick")
    vi.advanceTimersByTime(400)
    expect(inbox).toEqual([
      { kind: "gesture", key: K, gesture: "dblclick", t: 1000 },
    ])
  })

  it("turns a confirmed context menu into a whitelist request", () => {
    const el = card()
    actuator.realize([render(K, MASKED, [{ el, role: "anchor" }])])
    confirmAnswer = false
    clickVeil(el, "contextmenu")
    expect(inbox).toEqual([])
    confirmAnswer = true
    clickVeil(el, "contextmenu")
    expect(inbox).toEqual([{ kind: "whitelist-request", key: K, t: 1000 }])
  })

  it("ignores clicks that are not on a veil", () => {
    const el = card()
    actuator.realize([render(K, MASKED, [{ el, role: "anchor" }])])
    el
      .querySelector("a")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    vi.advanceTimersByTime(400)
    expect(inbox).toEqual([])
  })

  it("drops a staged click when the card is unmounted", () => {
    const el = card()
    actuator.realize([render(K, MASKED, [{ el, role: "anchor" }])])
    clickVeil(el, "click")
    actuator.realize([unmount(K)])
    vi.advanceTimersByTime(400)
    expect(inbox).toEqual([])
  })
})

describe("dispose", () => {
  it("removes a veil still animating out, even without an animationend", () => {
    const el = card()
    actuator.realize([render(K, MASKED, [{ el, role: "anchor" }])])
    actuator.realize([render(K, REVEALED, [{ el, role: "anchor" }])])
    expect(veilOf(el), "exiting").not.toBeNull()
    actuator.dispose()
    expect(
      veilOf(el),
      "a reduced-motion user is not left a stale veil"
    ).toBeNull()
    expect(el.hasAttribute("style")).toBe(false)
    vi.advanceTimersByTime(VEIL_EXIT_FALLBACK_MS)
    expect(el.querySelectorAll(".boyo-veil")).toHaveLength(0)
  })

  it("strips everything, stops listening, and swallows late answers", async () => {
    const el = card()
    let settle: (r: unknown) => void = () => {}
    answer = new Promise((resolve) => {
      settle = resolve
    })
    actuator.realize([
      render(K, MASKED, [{ el, role: "anchor" }]),
      {
        action: {
          kind: "query-whitelist",
          key: K,
          generation: 0,
          query: 1,
          channelId: asChannelId("@chan"),
        },
      },
      {
        action: {
          kind: "schedule",
          key: K,
          generation: 0,
          version: 1,
          delayMs: 100,
        },
      },
    ])
    actuator.dispose()
    expect(el.hasAttribute("data-boyo")).toBe(false)
    expect(veilOf(el)).toBeNull()

    settle({ ok: true, whitelisted: true })
    await vi.advanceTimersByTimeAsync(500)
    expect(inbox, "no answer, no timer, after dispose").toEqual([])

    // Listeners are gone: a click on a leftover veil-like node does nothing.
    const stray = document.createElement("div")
    stray.className = "boyo-veil"
    el.appendChild(stray)
    stray.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    vi.advanceTimersByTime(400)
    expect(inbox).toEqual([])
    actuator.realize([render(K, MASKED, [{ el, role: "anchor" }])])
    expect(el.hasAttribute("data-boyo"), "realize after dispose is inert").toBe(
      false
    )
  })
})
