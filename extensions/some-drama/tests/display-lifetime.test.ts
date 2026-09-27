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
