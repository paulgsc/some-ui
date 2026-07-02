// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { beforeEach, describe, expect, it, vi } from "vitest"

import { discard, inprogress } from "./discard"
import { prefs } from "./prefs"

type DiscardCb = (tab?: chrome.tabs.Tab) => void

const flush = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0))

const tab = (over: Partial<chrome.tabs.Tab>): chrome.tabs.Tab => ({
  id: 1,
  index: 0,
  active: false,
  discarded: false,
  autoDiscardable: true,
  pinned: false,
  highlighted: false,
  selected: false,
  incognito: false,
  windowId: 1,
  groupId: -1,
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  discard.count = 0
  discard.time = 0
  discard.tabs.length = 0
  inprogress.clear()

  // storage(prefs) reads local; default to "nothing persisted" (uses defaults)
  vi.mocked(chrome.storage.local.get).mockImplementation(
    (_keys: unknown, cb: (items: Record<string, unknown>) => void) => cb({})
  )

  // The chrome typings surface only the promise overload for executeScript's
  // generic form, so the mock implementation needs an assertion (same pattern
  // as number.test.ts).
  vi.mocked(chrome.scripting.executeScript).mockImplementation(
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    () => Promise.resolve([])
  )

  // tabs.discard resolves its callback immediately by default. The chrome
  // typings surface only the promise overload, so the callback form needs an
  // assertion (same pattern as chrome.tabs.update elsewhere).
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  vi.mocked(chrome.tabs.discard).mockImplementation(((
    _id: number,
    cb: DiscardCb
  ) => cb(undefined)) as never)
})

describe("discard", () => {
  it("suspends an eligible tab by calling chrome.tabs.discard", async () => {
    await discard(tab({ id: 1, url: "https://example.com/", title: "Example" }))

    expect(chrome.tabs.discard).toHaveBeenCalledWith(1, expect.any(Function))
    expect(chrome.tabs.remove).not.toHaveBeenCalled()
  })

  it("prepares the tab (marker + resume flag) before discarding", async () => {
    prefs.prepends = "💤"
    await discard(tab({ id: 1, url: "https://example.com/", title: "My Tab" }))

    expect(chrome.scripting.executeScript).toHaveBeenCalledWith(
      expect.objectContaining({
        target: { tabId: 1 },
        args: ["__sl_resuming", "💤"],
      })
    )
    // Preparation must complete before the tab is actually discarded.
    const prepareOrder = vi.mocked(chrome.scripting.executeScript).mock
      .invocationCallOrder[0]
    const discardOrder = vi.mocked(chrome.tabs.discard).mock
      .invocationCallOrder[0]
    expect(prepareOrder).toBeLessThan(discardOrder ?? Infinity)
  })

  it("still discards even when the tab can't be scripted (e.g. chrome://)", async () => {
    vi.mocked(chrome.scripting.executeScript).mockRejectedValue(
      new Error("Cannot access contents of the page")
    )

    await discard(tab({ id: 1, url: "https://example.com/" }))

    expect(chrome.tabs.discard).toHaveBeenCalledWith(1, expect.any(Function))
  })

  it("skips an active tab", async () => {
    await discard(tab({ id: 2, active: true }))

    expect(chrome.tabs.discard).not.toHaveBeenCalled()
  })

  it("skips an already-discarded tab (idempotency)", async () => {
    await discard(tab({ id: 3, discarded: true }))

    expect(chrome.tabs.discard).not.toHaveBeenCalled()
  })

  it("ignores a duplicate request while a suspend is in progress", async () => {
    discard(tab({ id: 4, url: "https://example.com/" }))
    discard(tab({ id: 4, url: "https://example.com/" }))
    await flush()

    expect(chrome.tabs.discard).toHaveBeenCalledTimes(1)
  })

  it("queues beyond the concurrency limit and drains the queue", async () => {
    // force the queue: simultaneous-jobs = 0 means the 2nd tab must wait
    vi.mocked(chrome.storage.local.get).mockImplementation(
      (_keys: unknown, cb: (items: Record<string, unknown>) => void) =>
        cb({ "simultaneous-jobs": 0 })
    )
    const cbs: Array<DiscardCb> = []

    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    vi.mocked(chrome.tabs.discard).mockImplementation(((
      _id: number,
      cb: DiscardCb
    ) => {
      cbs.push(cb)
    }) as never)

    discard(tab({ id: 10, url: "https://a.example.com/" }))
    discard(tab({ id: 11, url: "https://b.example.com/" }))
    await flush()

    // first is in-flight, second is parked in the queue
    expect(chrome.tabs.discard).toHaveBeenCalledTimes(1)
    expect(discard.tabs.length).toBe(1)

    cbs[0]?.() // complete the first suspend
    await flush()

    // queue drained: second tab now suspended
    expect(chrome.tabs.discard).toHaveBeenCalledTimes(2)
    expect(discard.tabs.length).toBe(0)

    cbs[1]?.()
    await flush()

    expect(chrome.tabs.remove).not.toHaveBeenCalled()
  })

  it("logs chrome.runtime.lastError when the browser rejects discard", async () => {
    const consoleSpy = vi
      .spyOn(console, "log")
      .mockImplementation(() => undefined)
    prefs.log = true

    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    vi.mocked(chrome.tabs.discard).mockImplementation(((
      _id: number,
      cb: DiscardCb
    ) => {
      Object.assign(chrome.runtime, {
        lastError: { message: "Cannot discard tab." },
      })
      cb(undefined)
      Object.assign(chrome.runtime, { lastError: undefined })
    }) as never)

    await discard(tab({ id: 50, url: "https://example.com/" }))

    expect(
      consoleSpy.mock.calls.some((c) =>
        c.some((a) => String(a).includes("Cannot discard tab."))
      )
    ).toBe(true)

    consoleSpy.mockRestore()
    prefs.log = false
  })

  it("never calls chrome.tabs.remove across any path", async () => {
    await discard(tab({ id: 20, url: "https://example.com/" }))
    await discard(tab({ id: 21, active: true }))
    await discard(tab({ id: 22, discarded: true }))

    expect(chrome.tabs.remove).toHaveBeenCalledTimes(0)
  })
})
