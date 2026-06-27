// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { beforeEach, describe, expect, it, vi } from "vitest"

import { discard, inprogress } from "./discard"
import { prefs } from "./prefs"

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
  // scripting.executeScript for title injection resolves immediately
  vi.mocked(chrome.scripting.executeScript).mockImplementation(
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    () => Promise.resolve([])
  )
  // tabs.discard succeeds by default (native discard happy path)
  vi.mocked(chrome.tabs.discard).mockImplementation(
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    () => Promise.resolve()
  )
})

describe("discard", () => {
  it("suspends an eligible tab via native discard", async () => {
    await discard(tab({ id: 1, url: "https://example.com/", title: "Example" }))

    expect(chrome.tabs.discard).toHaveBeenCalledWith(1)
    expect(chrome.tabs.update).not.toHaveBeenCalled()
    expect(chrome.tabs.remove).not.toHaveBeenCalled()
  })

  it("injects the prepends marker into the tab title before discarding", async () => {
    prefs.prepends = "💤"
    await discard(tab({ id: 1, url: "https://example.com/", title: "My Tab" }))

    expect(chrome.scripting.executeScript).toHaveBeenCalledWith(
      expect.objectContaining({ target: { tabId: 1 } })
    )
    expect(chrome.tabs.discard).toHaveBeenCalledWith(1)
  })

  it("falls back to the suspend page when native discard is rejected", async () => {
    vi.mocked(chrome.tabs.discard).mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      () => Promise.reject(new Error("Cannot discard tab."))
    )

    await discard(
      tab({ id: 1, url: "https://example.com/article", title: "A" })
    )

    expect(chrome.tabs.update).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ url: expect.stringContaining("suspend.html") })
    )
    expect(chrome.tabs.remove).not.toHaveBeenCalled()
  })

  it("includes the original URL in the fallback suspend page URL", async () => {
    vi.mocked(chrome.tabs.discard).mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      () => Promise.reject(new Error("fail"))
    )

    await discard(
      tab({ id: 1, url: "https://example.com/article", title: "A" })
    )

    const call = vi.mocked(chrome.tabs.update).mock.calls[0]
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const url = new URL((call?.[1] as chrome.tabs.UpdateProperties).url ?? "")
    expect(url.searchParams.get("url")).toBe("https://example.com/article")
  })

  it("skips an active tab", async () => {
    await discard(tab({ id: 2, active: true }))

    expect(chrome.tabs.discard).not.toHaveBeenCalled()
  })

  it("skips an already-discarded tab (idempotency)", async () => {
    await discard(tab({ id: 3, discarded: true }))

    expect(chrome.tabs.discard).not.toHaveBeenCalled()
  })

  it("skips a tab already showing the suspend page", async () => {
    const suspendUrl =
      "moz-extension://testid/suspend.html?url=https%3A%2F%2Fexample.com%2F"
    await discard(tab({ id: 4, url: suspendUrl }))

    expect(chrome.tabs.discard).not.toHaveBeenCalled()
  })

  it("ignores a duplicate request while a suspend is in progress", async () => {
    // Make discard hang so the second call arrives while the first is in-flight
    vi.mocked(chrome.tabs.discard).mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      () => new Promise(() => {})
    )

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
    const resolvers: Array<() => void> = []
    vi.mocked(chrome.tabs.discard).mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      () =>
        new Promise<void>((resolve) => {
          resolvers.push(resolve)
        })
    )

    discard(tab({ id: 10, url: "https://a.example.com/" }))
    discard(tab({ id: 11, url: "https://b.example.com/" }))
    await flush()

    // first is in-flight, second is parked in the queue
    expect(chrome.tabs.discard).toHaveBeenCalledTimes(1)
    expect(discard.tabs.length).toBe(1)

    resolvers[0]?.() // complete the first discard
    await flush()

    // queue drained: second tab now discarded
    expect(chrome.tabs.discard).toHaveBeenCalledTimes(2)
    expect(discard.tabs.length).toBe(0)

    resolvers[1]?.()
    await flush()

    expect(chrome.tabs.remove).not.toHaveBeenCalled()
  })

  it("never calls chrome.tabs.remove across any path", async () => {
    await discard(tab({ id: 20, url: "https://example.com/" }))
    await discard(tab({ id: 21, active: true }))
    await discard(tab({ id: 22, discarded: true }))

    expect(chrome.tabs.remove).toHaveBeenCalledTimes(0)
  })
})
