// @vitest-environment jsdom
/**
 * A card exists only on a page that is showing (Charter §7). A background tab
 * keeps the latest state but builds nothing and asks for nothing until it is
 * shown; a tab that stops showing lets its card go.
 */

import { createDisplay } from "@drama/content/display"
import type { Display } from "@drama/content/display"
import { probeResources } from "@some-extension/common/testing"
import type { ResourceProbe } from "@some-extension/common/testing"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { nextFrame, setVisibility, STATE } from "./helpers/fixtures"

const sendMessage = vi.fn((msg: { type: string }) =>
  Promise.resolve(
    msg.type === "GET_BEATS"
      ? { ok: true, episode: "Ep 12", beats: [] }
      : msg.type === "GET_VERDICTS"
        ? { ok: true, verdicts: [] }
        : { ok: true }
  )
)

let probe: ResourceProbe
let display: Display | null = null

beforeEach(() => {
  document.body.innerHTML = ""
  sendMessage.mockClear()
  Object.defineProperty(globalThis, "browser", {
    value: {
      runtime: { sendMessage },
      storage: {
        local: {
          get: () => Promise.resolve({}),
          set: () => Promise.resolve(),
        },
      },
    },
    configurable: true,
  })
  probe = probeResources()
})

afterEach(() => {
  display?.destroy()
  display = null
  probe.restore()
  setVisibility("visible")
})

const card = (): Element | null => document.querySelector("#dc-root")
const askedForBeats = (): boolean =>
  sendMessage.mock.calls.some(([m]) => m.type === "GET_BEATS")

function mountDisplay(): Display {
  display = createDisplay({
    cardMeta: null,
    onCardMeta: () => {},
    refetch: () => {},
  })
  return display
}

describe("the display builds a card only on a showing page", () => {
  it("builds nothing, and asks for nothing, in a background tab", async () => {
    setVisibility("hidden")
    mountDisplay().apply(STATE)
    await nextFrame()
    expect(card()).toBeNull()
    expect(askedForBeats()).toBe(false)
    expect(probe.counts().intervals).toBe(0)
  })

  it("builds the card when the tab is shown", async () => {
    setVisibility("hidden")
    mountDisplay().apply(STATE)
    setVisibility("visible")
    await nextFrame()
    expect(card()).not.toBeNull()
    expect(askedForBeats()).toBe(true)
  })

  it("lets the card go when the tab stops showing", async () => {
    setVisibility("visible")
    mountDisplay().apply(STATE)
    await nextFrame()
    expect(card()).not.toBeNull()

    setVisibility("hidden")
    expect(card()).toBeNull()
    expect(probe.counts()).toMatchObject({ intervals: 0, frames: 0 })
  })
})

describe("an edit to the showing drama keeps its card", () => {
  it("updates the card in place, and spotlights a verdict change", async () => {
    setVisibility("visible")
    const d = mountDisplay()
    d.apply(STATE)
    await nextFrame()
    const before = card()

    const [entry] = STATE.watchlist
    if (!entry) throw new Error("fixture has no entry")
    d.apply({ ...STATE, watchlist: [{ ...entry, rating: entry.rating + 1 }] })
    expect(card()).toBe(before)
    expect(card()?.getAttribute("data-spot")).toBe("rating")
    // …and refetches the verdict history the change was just logged to.
    const verdictFetches = sendMessage.mock.calls.filter(
      ([m]) => m.type === "GET_VERDICTS"
    )
    expect(verdictFetches).toHaveLength(2)
  })

  it("rebuilds the card for a different drama", async () => {
    setVisibility("visible")
    const d = mountDisplay()
    d.apply(STATE)
    await nextFrame()
    const before = card()

    const [entry] = STATE.watchlist
    if (!entry) throw new Error("fixture has no entry")
    const other = { ...entry, id: "d2", title: "Lovely Runner" }
    d.apply({ ...STATE, watchlist: [entry, other], activeId: "d2" })
    expect(card()).not.toBe(before)
  })
})

describe("beats that arrive while the card loads its episode", () => {
  it("survive the reply, which was read before they were logged", async () => {
    type Reply = Awaited<ReturnType<typeof sendMessage>>
    let reply: (v: Reply) => void = () => {}
    sendMessage.mockImplementationOnce(
      () =>
        new Promise<Reply>((resolve) => {
          reply = resolve
        })
    )
    setVisibility("visible")
    const d = mountDisplay()
    d.apply(STATE)
    await nextFrame()

    // GET_BEATS is in flight; a beat is logged and broadcast meanwhile.
    d.onBeat({
      id: "b1",
      dramaId: "d1",
      dramaTitle: "Queen of Tears",
      episode: "Ep 12",
      mood: "love",
      intensity: 1,
      videoTime: 60,
      duration: 3600,
      capturedAt: 0,
      updatedAt: 0,
    })
    // …and then the stale snapshot arrives, without it.
    reply({ ok: true, episode: "Ep 12", beats: [] })
    await nextFrame()

    expect(card()?.querySelector(".dc-live")?.getAttribute("data-empty")).toBe(
      "false"
    )
  })
})
