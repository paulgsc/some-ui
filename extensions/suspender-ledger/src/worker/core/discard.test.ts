// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { beforeEach, describe, expect, it, vi } from "vitest"

import { discard, inprogress } from "./discard"

type DiscardCb = () => void

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
  // discard resolves its callback immediately by default. The chrome typings
  // surface only the promise overload, so the callback form needs an assertion.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  vi.mocked(chrome.tabs.discard).mockImplementation(((
    _id: number,
    cb: DiscardCb
  ) => cb()) as never)
})

describe("discard", () => {
  it("discards an eligible tab via chrome.tabs.discard", async () => {
    await discard(tab({ id: 1 }))

    expect(chrome.tabs.discard).toHaveBeenCalledWith(1, expect.any(Function))
    expect(chrome.tabs.remove).not.toHaveBeenCalled()
  })

  it("skips an active tab", async () => {
    await discard(tab({ id: 2, active: true }))

    expect(chrome.tabs.discard).not.toHaveBeenCalled()
  })

  it("skips an already-discarded tab (idempotency)", async () => {
    await discard(tab({ id: 3, discarded: true }))

    expect(chrome.tabs.discard).not.toHaveBeenCalled()
  })

  it("ignores a duplicate request while a discard is in progress", async () => {
    discard(tab({ id: 4 }))
    discard(tab({ id: 4 }))
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

    discard(tab({ id: 10 }))
    discard(tab({ id: 11 }))
    await flush()

    // first is in-flight, second is parked in the queue
    expect(chrome.tabs.discard).toHaveBeenCalledTimes(1)
    expect(discard.tabs.length).toBe(1)

    cbs[0]?.() // complete the first discard
    await flush()

    // queue drained: second tab now discarded
    expect(chrome.tabs.discard).toHaveBeenCalledTimes(2)
    expect(discard.tabs.length).toBe(0)

    cbs[1]?.()
    await flush()

    expect(chrome.tabs.remove).not.toHaveBeenCalled()
  })

  it("never calls chrome.tabs.remove across any path", async () => {
    await discard(tab({ id: 20 }))
    await discard(tab({ id: 21, active: true }))
    await discard(tab({ id: 22, discarded: true }))

    expect(chrome.tabs.remove).toHaveBeenCalledTimes(0)
  })
})
