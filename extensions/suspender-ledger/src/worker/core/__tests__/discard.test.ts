// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { tab } from "@suspender/worker/core/__tests__/tab"
import {
  discard,
  inprogress,
  reconcileActivatedTab,
} from "@suspender/worker/core/discard"
import { prefs } from "@suspender/worker/core/prefs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const flush = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0))

/** Tab ids the fake browser currently considers discarded. */
const discarded = new Set<number>()

/**
 * Resolve a `tabs.discard` call the way a real browser does: the tab is now
 * discarded, and every later `tabs.get` must agree. Post-discard verification
 * reads `tabs.get`, so a mock discard that skips this reads as a silent no-op.
 */
const settleDiscard = (id: number | undefined): chrome.tabs.Tab => {
  if (id !== undefined) {
    discarded.add(id)
  }
  return tab({ id, discarded: true })
}

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

  // tabs.discard resolves immediately by default, promise form only (see
  // discard-adapter.ts → discardOnce). It shares `discarded` with tabs.get,
  // which is ground truth for both rollback and post-success verification.
  discarded.clear()
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  vi.mocked(chrome.tabs.discard).mockImplementation((id?: number) =>
    Promise.resolve(settleDiscard(id))
  )

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  vi.mocked(chrome.tabs.get).mockImplementation(((
    id: number,
    cb: (t?: chrome.tabs.Tab) => void
  ) => cb(tab({ id, discarded: discarded.has(id) }))) as never)
})

afterEach(() => {
  vi.useRealTimers()
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
  })

  it("does not roll back (which would reload the tab) when discard reports failure but the tab is already discarded", async () => {
    // Discard surfaces an error on both attempts, yet the tab IS discarded.
    // Rolling back would executeScript into a tab with no live renderer,
    // forcing Firefox to reload it in the background, so the rollback is
    // gated on ground-truth liveness.
    vi.useFakeTimers()
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
  })

  it("recovers without rolling back when a retry succeeds after a transient rejection", async () => {
    // The manual-suspend race: the browser momentarily refuses the first
    // discard, then accepts the next attempt.
    vi.useFakeTimers()
    prefs.prepends = "💤"
    let calls = 0
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    vi.mocked(chrome.tabs.discard).mockImplementation((id?: number) => {
      calls += 1
      if (calls === 1) {
        return Promise.reject(new Error("Tabs cannot be discarded."))
      }
      return Promise.resolve(settleDiscard(id))
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
  })

  it("rolls back the marker when discard reports success but the tab is still live", async () => {
    // The silent no-op: Firefox resolves `tabs.discard` for tabs it then
    // declines to discard (a beforeunload handler, a recently used tab).
    prefs.prepends = "💤"
    try {
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      vi.mocked(chrome.tabs.discard).mockImplementation((id?: number) =>
        // Resolves happily; deliberately does NOT mark the tab discarded.
        Promise.resolve(tab({ id, discarded: false }))
      )

      await discard(
        tab({ id: 77, url: "https://example.com/", title: "Example" })
      )

      // mark, then unmark: the marker must not be stranded on a live tab.
      expect(chrome.scripting.executeScript).toHaveBeenCalledTimes(2)
    } finally {
      prefs.prepends = ""
    }
  })

  it("accepts a discard that lands slightly after the promise resolves", async () => {
    // The browser updates `discarded` asynchronously with respect to the
    // discard promise, so a slow-but-real suspend must not be misread as a
    // no-op and rolled back.
    vi.useFakeTimers()
    prefs.prepends = "💤"
    try {
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      vi.mocked(chrome.tabs.discard).mockImplementation((id?: number) => {
        setTimeout(() => {
          if (id !== undefined) {
            discarded.add(id)
          }
        }, 100)
        return Promise.resolve(tab({ id, discarded: true }))
      })

      const done = discard(
        tab({ id: 78, url: "https://example.com/", title: "Example" })
      )
      await vi.advanceTimersByTimeAsync(3000)
      await done

      // Only the mark ran — nothing was rolled back.
      expect(chrome.scripting.executeScript).toHaveBeenCalledTimes(1)
    } finally {
      prefs.prepends = ""
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
      (id?: number) =>
        new Promise<chrome.tabs.Tab>((resolve) => {
          resolvers.push((t) => {
            settleDiscard(id)
            resolve(t)
          })
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
