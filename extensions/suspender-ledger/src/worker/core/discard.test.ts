// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { beforeEach, describe, expect, it, vi } from "vitest"

import { discard, inprogress } from "./discard"
import { prefs } from "./prefs"

type UpdateCb = (tab?: chrome.tabs.Tab) => void

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
  // tabs.update resolves its callback immediately by default.

  vi.mocked(chrome.tabs.update).mockImplementation(
    (_id: number, _props: chrome.tabs.UpdateProperties, cb: UpdateCb) =>
      cb(undefined)
  )
})

describe("discard", () => {
  it("suspends an eligible tab by navigating to the suspend page", async () => {
    await discard(tab({ id: 1, url: "https://example.com/", title: "Example" }))

    expect(chrome.tabs.update).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ url: expect.stringContaining("suspend.html") }),
      expect.any(Function)
    )
    expect(chrome.tabs.remove).not.toHaveBeenCalled()
  })

  it("includes the prepends marker in the suspend URL title", async () => {
    prefs.prepends = "💤"
    await discard(tab({ id: 1, url: "https://example.com/", title: "My Tab" }))

    const call = vi.mocked(chrome.tabs.update).mock.calls[0]
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const url = new URL((call?.[1] as chrome.tabs.UpdateProperties).url ?? "")
    expect(url.searchParams.get("title")).toBe("💤 My Tab")
  })

  it("includes the original URL in the suspend URL params", async () => {
    await discard(
      tab({ id: 1, url: "https://example.com/article", title: "A" })
    )

    const call = vi.mocked(chrome.tabs.update).mock.calls[0]
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const url = new URL((call?.[1] as chrome.tabs.UpdateProperties).url ?? "")
    expect(url.searchParams.get("url")).toBe("https://example.com/article")
  })

  it("includes the favicon in the suspend URL params when present", async () => {
    const favicon = "https://example.com/favicon.ico"
    await discard(
      tab({ id: 1, url: "https://example.com/", favIconUrl: favicon })
    )

    const call = vi.mocked(chrome.tabs.update).mock.calls[0]
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const url = new URL((call?.[1] as chrome.tabs.UpdateProperties).url ?? "")
    expect(url.searchParams.get("favicon")).toBe(favicon)
  })

  it("skips an active tab", async () => {
    await discard(tab({ id: 2, active: true }))

    expect(chrome.tabs.update).not.toHaveBeenCalled()
  })

  it("skips an already-discarded tab (idempotency)", async () => {
    await discard(tab({ id: 3, discarded: true }))

    expect(chrome.tabs.update).not.toHaveBeenCalled()
  })

  it("skips a tab already showing the suspend page", async () => {
    const suspendUrl =
      "moz-extension://testid/suspend.html?url=https%3A%2F%2Fexample.com%2F"
    await discard(tab({ id: 4, url: suspendUrl }))

    expect(chrome.tabs.update).not.toHaveBeenCalled()
  })

  it("ignores a duplicate request while a suspend is in progress", async () => {
    discard(tab({ id: 4, url: "https://example.com/" }))
    discard(tab({ id: 4, url: "https://example.com/" }))
    await flush()

    expect(chrome.tabs.update).toHaveBeenCalledTimes(1)
  })

  it("queues beyond the concurrency limit and drains the queue", async () => {
    // force the queue: simultaneous-jobs = 0 means the 2nd tab must wait
    vi.mocked(chrome.storage.local.get).mockImplementation(
      (_keys: unknown, cb: (items: Record<string, unknown>) => void) =>
        cb({ "simultaneous-jobs": 0 })
    )
    const cbs: Array<UpdateCb> = []

    vi.mocked(chrome.tabs.update).mockImplementation(
      (_id: number, _props: chrome.tabs.UpdateProperties, cb: UpdateCb) => {
        cbs.push(cb)
      }
    )

    discard(tab({ id: 10, url: "https://a.example.com/" }))
    discard(tab({ id: 11, url: "https://b.example.com/" }))
    await flush()

    // first is in-flight, second is parked in the queue
    expect(chrome.tabs.update).toHaveBeenCalledTimes(1)
    expect(discard.tabs.length).toBe(1)

    cbs[0]?.() // complete the first suspend
    await flush()

    // queue drained: second tab now suspended
    expect(chrome.tabs.update).toHaveBeenCalledTimes(2)
    expect(discard.tabs.length).toBe(0)

    cbs[1]?.()
    await flush()

    expect(chrome.tabs.remove).not.toHaveBeenCalled()
  })

  it("logs chrome.runtime.lastError when the browser rejects navigation", async () => {
    const consoleSpy = vi
      .spyOn(console, "log")
      .mockImplementation(() => undefined)
    prefs.log = true

    vi.mocked(chrome.tabs.update).mockImplementation(
      (_id: number, _props: chrome.tabs.UpdateProperties, cb: UpdateCb) => {
        Object.assign(chrome.runtime, {
          lastError: { message: "Cannot update tab." },
        })
        cb(undefined)
        Object.assign(chrome.runtime, { lastError: undefined })
      }
    )

    await discard(tab({ id: 50, url: "https://example.com/" }))

    expect(
      consoleSpy.mock.calls.some((c) =>
        c.some((a) => String(a).includes("Cannot update tab."))
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
