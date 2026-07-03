// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { beforeEach, describe, expect, it, vi } from "vitest"

import { discard, inprogress, reconcileActivatedTab } from "./discard"
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

  // The chrome typings surface only the promise overload for executeScript's
  // generic form, so the mock implementation needs an assertion (same pattern
  // as number.test.ts).
  vi.mocked(chrome.scripting.executeScript).mockImplementation(
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    () => Promise.resolve([])
  )

  // tabs.discard resolves immediately by default. Called with ONLY a tabId —
  // no callback — because Firefox's actual runtime implementation of
  // chrome.tabs.discard does not support the callback overload the
  // @types/chrome bindings advertise; only the promise form works
  // cross-browser (see discard-adapter.ts's discardOnce docstring).
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  vi.mocked(chrome.tabs.discard).mockImplementation((id?: number) =>
    Promise.resolve(tab({ id, discarded: true }))
  )

  // tabs.get resolves a live (non-discarded) snapshot by default. The rollback
  // path consults it as ground truth: a marker is only stripped from a tab
  // that is genuinely still live, so we never inject into (and thereby reload)
  // a tab the browser has already discarded.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  vi.mocked(chrome.tabs.get).mockImplementation(((
    id: number,
    cb: (t?: chrome.tabs.Tab) => void
  ) => cb(tab({ id, discarded: false }))) as never)
})

describe("discard", () => {
  it("suspends an eligible tab by calling chrome.tabs.discard", async () => {
    await discard(tab({ id: 1, url: "https://example.com/", title: "Example" }))

    expect(chrome.tabs.discard).toHaveBeenCalledWith(1)
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

    expect(chrome.tabs.discard).toHaveBeenCalledWith(1)
  })

  it("skips an active tab", async () => {
    await discard(tab({ id: 2, active: true }))

    expect(chrome.tabs.discard).not.toHaveBeenCalled()
  })

  it("skips an already-discarded tab (idempotency)", async () => {
    await discard(tab({ id: 3, discarded: true }))

    expect(chrome.tabs.discard).not.toHaveBeenCalled()
  })

  it("skips an audible tab without marking it (the YouTube case)", async () => {
    // The browser refuses to discard a playing tab; suspending it anyway would
    // strand the sleep marker on a live, audible page. Skip before marking.
    await discard(
      tab({ id: 7, url: "https://youtube.com/watch", audible: true })
    )

    expect(chrome.scripting.executeScript).not.toHaveBeenCalled()
    expect(chrome.tabs.discard).not.toHaveBeenCalled()
  })

  it("rolls back the marker when the browser rejects the discard on both attempts", async () => {
    vi.useFakeTimers()
    try {
      prefs.prepends = "💤"
      vi.mocked(chrome.tabs.discard).mockRejectedValue(
        new Error("Tabs cannot be discarded.")
      )

      const done = discard(
        tab({ id: 8, url: "https://example.com/", title: "Example" })
      )
      await vi.advanceTimersByTimeAsync(1000)
      await done

      // A persistent rejection is retried once (transient races get one more
      // chance to clear) before giving up.
      expect(chrome.tabs.discard).toHaveBeenCalledTimes(2)
      // Two executeScript calls: the mark, then the rollback (unmark).
      expect(chrome.scripting.executeScript).toHaveBeenCalledTimes(2)
      expect(chrome.scripting.executeScript).toHaveBeenLastCalledWith(
        expect.objectContaining({
          target: { tabId: 8 },
          args: ["__sl_resuming", "💤"],
        })
      )
      expect(chrome.tabs.remove).not.toHaveBeenCalled()
      prefs.prepends = ""
    } finally {
      vi.useRealTimers()
    }
  })

  it("does not roll back (which would reload the tab) when discard reports failure but the tab is already discarded", async () => {
    // The Firefox "silent refresh" bug: discard surfaces lastError on both
    // attempts, yet the tab actually IS discarded (a false-negative error, or
    // the retry landing on an already-discarded tab). Rolling back here would
    // executeScript into a tab with no live renderer, forcing Firefox to
    // reload it in the background and strip the marker. The rollback must be
    // gated on ground-truth liveness instead of trusting the reported error.
    vi.useFakeTimers()
    try {
      prefs.prepends = "💤"
      vi.mocked(chrome.tabs.discard).mockRejectedValue(
        new Error("Tabs cannot be discarded.")
      )
      // ground truth: the tab really is discarded despite the reported error
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      vi.mocked(chrome.tabs.get).mockImplementation(((
        id: number,
        cb: (t?: chrome.tabs.Tab) => void
      ) => cb(tab({ id, discarded: true }))) as never)

      const done = discard(
        tab({ id: 13, url: "https://example.com/", title: "Example" })
      )
      await vi.advanceTimersByTimeAsync(1000)
      await done

      // The liveness check ran, and only the mark executeScript fired — NO
      // rollback/unmark, so the discarded tab is never materialized/reloaded.
      expect(chrome.tabs.get).toHaveBeenCalledWith(13, expect.any(Function))
      expect(chrome.scripting.executeScript).toHaveBeenCalledTimes(1)
      expect(chrome.tabs.remove).not.toHaveBeenCalled()
      prefs.prepends = ""
    } finally {
      vi.useRealTimers()
    }
  })

  it("recovers without rolling back when a retry succeeds after a transient rejection", async () => {
    // Models the manual-suspend race: the browser momentarily refuses the
    // first discard (e.g. the focus switch away from this tab, or the mark's
    // own executeScript call, hasn't fully settled yet), then accepts it on
    // the very next attempt.
    vi.useFakeTimers()
    try {
      prefs.prepends = "💤"
      let calls = 0
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      vi.mocked(chrome.tabs.discard).mockImplementation((id?: number) => {
        calls += 1
        if (calls === 1) {
          return Promise.reject(new Error("Tabs cannot be discarded."))
        }
        return Promise.resolve(tab({ id, discarded: true }))
      })

      const done = discard(
        tab({ id: 12, url: "https://example.com/", title: "Example" })
      )
      await vi.advanceTimersByTimeAsync(1000)
      await done

      expect(chrome.tabs.discard).toHaveBeenCalledTimes(2)
      // Only the mark ran — the retry succeeded, so nothing was rolled back.
      expect(chrome.scripting.executeScript).toHaveBeenCalledTimes(1)
      prefs.prepends = ""
    } finally {
      vi.useRealTimers()
    }
  })

  it("does not roll back the marker when the discard succeeds", async () => {
    prefs.prepends = "💤"
    await discard(tab({ id: 9, url: "https://example.com/", title: "Example" }))

    // Only the mark ran; a successful discard tears down the page and the
    // browser keeps showing the cached (marked) title — nothing to undo.
    expect(chrome.scripting.executeScript).toHaveBeenCalledTimes(1)
    prefs.prepends = ""
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
    const resolvers: Array<(tab: chrome.tabs.Tab) => void> = []

    /* eslint-disable @typescript-eslint/no-misused-promises -- mockImplementation's typed overloads include a void-returning form; the promise form is the one that's actually cross-browser-correct, see discard-adapter.ts */
    vi.mocked(chrome.tabs.discard).mockImplementation(
      () =>
        new Promise<chrome.tabs.Tab>((resolve) => {
          resolvers.push(resolve)
        })
    )
    /* eslint-enable @typescript-eslint/no-misused-promises */

    discard(tab({ id: 10, url: "https://a.example.com/" }))
    discard(tab({ id: 11, url: "https://b.example.com/" }))
    await flush()

    // first is in-flight, second is parked in the queue
    expect(chrome.tabs.discard).toHaveBeenCalledTimes(1)
    expect(discard.tabs.length).toBe(1)

    resolvers[0]?.(tab({ id: 10, discarded: true })) // complete the first suspend
    await flush()

    // queue drained: second tab now suspended
    expect(chrome.tabs.discard).toHaveBeenCalledTimes(2)
    expect(discard.tabs.length).toBe(0)

    resolvers[1]?.(tab({ id: 11, discarded: true }))
    await flush()

    expect(chrome.tabs.remove).not.toHaveBeenCalled()
  })

  it("logs the failure message when the browser rejects discard", async () => {
    const consoleSpy = vi
      .spyOn(console, "log")
      .mockImplementation(() => undefined)
    prefs.log = true

    vi.mocked(chrome.tabs.discard).mockRejectedValue(
      new Error("Cannot discard tab.")
    )

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

describe("reconcileActivatedTab", () => {
  type GetCb = (tab?: chrome.tabs.Tab) => void

  const mockGet = (result?: chrome.tabs.Tab): void => {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    vi.mocked(chrome.tabs.get).mockImplementation(((_id: number, cb: GetCb) =>
      cb(result)) as never)
  }

  it("strips a stranded marker from a live, marked tab", () => {
    prefs.prepends = "💤"
    mockGet(tab({ id: 30, discarded: false, title: "💤 Example" }))

    reconcileActivatedTab(30)

    expect(chrome.scripting.executeScript).toHaveBeenCalledWith(
      expect.objectContaining({
        target: { tabId: 30 },
        args: ["__sl_resuming", "💤"],
      })
    )
    prefs.prepends = ""
  })

  it("leaves a properly discarded tab alone (cached marker is intended)", () => {
    prefs.prepends = "💤"
    mockGet(tab({ id: 31, discarded: true, title: "💤 Example" }))

    reconcileActivatedTab(31)

    expect(chrome.scripting.executeScript).not.toHaveBeenCalled()
    prefs.prepends = ""
  })

  it("leaves an unmarked live tab alone", () => {
    prefs.prepends = "💤"
    mockGet(tab({ id: 32, discarded: false, title: "Example" }))

    reconcileActivatedTab(32)

    expect(chrome.scripting.executeScript).not.toHaveBeenCalled()
    prefs.prepends = ""
  })
})
