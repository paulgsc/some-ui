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

import {
  nextFrame,
  setVisibility,
  sourceReport,
  STATE,
} from "./helpers/fixtures"

// Replies are what the background would send; `unknown`, as runtime
// messages are, so a test can hand back any shape it needs.
const defaultReply = (msg: { type: string }): Promise<unknown> =>
  Promise.resolve(
    msg.type === "GET_BEATS"
      ? { ok: true, episode: "Ep 12", beats: [] }
      : msg.type === "GET_VERDICTS"
        ? { ok: true, verdicts: [] }
        : msg.type === "GET_LIVE_PLAYBACK"
          ? { ok: true, live: null }
          : { ok: true }
  )
const sendMessage = vi.fn(defaultReply)

let probe: ResourceProbe
let display: Display | null = null

beforeEach(() => {
  document.body.innerHTML = ""
  sendMessage.mockReset()
  sendMessage.mockImplementation(defaultReply)
  onHidden.mockClear()
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

const onHidden = vi.fn((_hidden: boolean): void => {})

function mountDisplay(hidden = false): Display {
  display = createDisplay({
    cardMeta: null,
    onCardMeta: () => {},
    hidden,
    onHidden,
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

describe("a card toggled off holds nothing until toggled back on", () => {
  it("releases the card on toggle-off, and ignores state until toggled on", async () => {
    setVisibility("visible")
    const d = mountDisplay()
    d.apply(STATE)
    await nextFrame()
    expect(probe.counts().intervals).toBe(1)

    d.toggleVisibility()
    expect(onHidden).toHaveBeenLastCalledWith(true)
    expect(card()).toBeNull()
    expect(probe.counts()).toMatchObject({ intervals: 0, frames: 0 })

    // A state change (another drama, an edit) or the tab being shown again
    // builds nothing and asks for nothing while the card is off.
    sendMessage.mockClear()
    const [entry] = STATE.watchlist
    if (!entry) throw new Error("fixture has no entry")
    d.apply({ ...STATE, watchlist: [{ ...entry, rating: entry.rating + 1 }] })
    setVisibility("hidden")
    setVisibility("visible")
    await nextFrame()
    expect(card()).toBeNull()
    expect(sendMessage).not.toHaveBeenCalled()

    d.toggleVisibility()
    expect(onHidden).toHaveBeenLastCalledWith(false)
    await nextFrame()
    expect(card()).not.toBeNull()
    expect(askedForBeats()).toBe(true)
  })

  it("starts hidden in a tab where it was toggled off (a navigation)", async () => {
    setVisibility("visible")
    const d = mountDisplay(true)
    d.apply(STATE)
    await nextFrame()
    expect(card()).toBeNull()
    expect(askedForBeats()).toBe(false)
    expect(probe.counts().intervals).toBe(0)

    d.toggleVisibility()
    await nextFrame()
    expect(card()).not.toBeNull()
  })
})

describe("the card follows the drama's video live", () => {
  const timestamp = (): string | null | undefined =>
    card()?.querySelector(".dc-timestamp")?.textContent

  it("shows where the video is now, from the latest report, not the saved entry", async () => {
    setVisibility("visible")
    const d = mountDisplay()
    d.apply(STATE)
    await nextFrame()
    expect(timestamp()).toBe("00:00") // the entry's saved position

    // Reported 65 s ago at 1:00, playing since: 2:05 now.
    d.onPlayback(sourceReport(60, true, Date.now() - 65_000))
    expect(timestamp()).toBe("02:05")
    expect(card()?.querySelector(".dc-ep-badge")?.textContent).toBe("Ep 13")

    // Paused: the time stays where the report says.
    d.onPlayback(sourceReport(200, false, Date.now() - 65_000))
    expect(timestamp()).toBe("03:20")
  })

  it("keeps the report across a rebuild, and drops a first-look reply a broadcast overtook", async () => {
    type Reply = Awaited<ReturnType<typeof sendMessage>>
    const replies: Array<(v: Reply) => void> = []
    sendMessage.mockImplementation((msg: { type: string }) =>
      msg.type === "GET_LIVE_PLAYBACK"
        ? new Promise<Reply>((resolve) => {
            replies.push(resolve)
          })
        : defaultReply(msg)
    )
    setVisibility("visible")
    const d = mountDisplay()
    d.apply(STATE)
    await nextFrame()

    d.onPlayback(sourceReport(300, false))
    replies[0]?.({ ok: true, live: sourceReport(10, false) })
    await nextFrame()
    expect(timestamp()).toBe("05:00")

    // A different drama rebuilds the card; it starts from the report.
    const [entry] = STATE.watchlist
    if (!entry) throw new Error("fixture has no entry")
    const other = { ...entry, id: "d2", title: "Lovely Runner" }
    d.apply({ ...STATE, watchlist: [entry, other], activeId: "d2" })
    expect(timestamp()).toBe("05:00")
  })
})

describe("first-look replies that arrive out of order", () => {
  it("keeps the newer ask's reply when an older one lands after it", async () => {
    type Reply = Awaited<ReturnType<typeof sendMessage>>
    const replies: Array<(v: Reply) => void> = []
    sendMessage.mockImplementation((msg: { type: string }) =>
      msg.type === "GET_LIVE_PLAYBACK"
        ? new Promise<Reply>((resolve) => {
            replies.push(resolve)
          })
        : defaultReply(msg)
    )
    setVisibility("visible")
    const d = mountDisplay()
    d.apply(STATE)
    await nextFrame()
    // The tab is hidden and shown again: the card is rebuilt and asks again
    // while the first ask is still out.
    setVisibility("hidden")
    setVisibility("visible")
    await nextFrame()
    expect(replies).toHaveLength(2)

    const [older, newer] = replies
    newer?.({ ok: true, live: sourceReport(300, false) })
    await nextFrame()
    older?.({ ok: true, live: sourceReport(10, false) })
    await nextFrame()
    expect(card()?.querySelector(".dc-timestamp")?.textContent).toBe("05:00")
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

describe("verdict history that arrives out of order", () => {
  it("keeps the newer snapshot when an older reply lands after it", async () => {
    type Reply = Awaited<ReturnType<typeof sendMessage>>
    const pending: Array<(v: Reply) => void> = []
    // Only for the four requests this test makes (GET_BEATS, GET_VERDICTS,
    // GET_LIVE_PLAYBACK, then GET_VERDICTS again); the file's default mock
    // answers everything after.
    const holdVerdicts = (msg: { type: string }): Promise<Reply> =>
      msg.type === "GET_VERDICTS"
        ? new Promise<Reply>((resolve) => {
            pending.push(resolve)
          })
        : defaultReply(msg)
    sendMessage
      .mockImplementationOnce(holdVerdicts)
      .mockImplementationOnce(holdVerdicts)
      .mockImplementationOnce(holdVerdicts)
      .mockImplementationOnce(holdVerdicts)
    setVisibility("visible")
    const d = mountDisplay()
    d.apply(STATE)
    await nextFrame()

    // A verdict moves while the first history read is still in flight.
    const [entry] = STATE.watchlist
    if (!entry) throw new Error("fixture has no entry")
    d.apply({ ...STATE, watchlist: [{ ...entry, rating: entry.rating + 1 }] })
    expect(pending).toHaveLength(2)

    const change = {
      dramaId: "d1",
      dramaTitle: "Queen of Tears",
      field: "rating" as const,
      videoTime: null,
    }
    const [older, newer] = pending
    // The newer read (with the change) resolves first, the older one last.
    newer?.({
      ok: true,
      verdicts: [
        { ...change, id: "v1", episode: "Ep 1", from: 6, to: 8, at: 0 },
        { ...change, id: "v2", episode: "Ep 2", from: 8, to: 9, at: 1 },
      ],
    })
    await nextFrame()
    older?.({ ok: true, verdicts: [] })
    await nextFrame()

    expect(card()?.querySelector(".dc-rating-label")?.textContent).toBe(
      "from 6.0 · Ep 1"
    )
  })
})
