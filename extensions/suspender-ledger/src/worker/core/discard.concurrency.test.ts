// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Adapter-level concurrency tests for `discard.ts` — the "thunderstorm" smell
 * test: does the real, shipped mark/unmark logic and its in-flight bookkeeping
 * survive overlapping suspend requests for the same tab, or does it stack the
 * sleep marker / duplicate work?
 *
 * These drive the actual `discard()` entry point (not a reimplementation) and
 * let `chrome.scripting.executeScript`'s mock invoke the real injected
 * closures (`markBeforeDiscard` / `unmarkAfterDiscard`) against jsdom's real
 * `document`, so a passing test proves something about the shipped code, not
 * about a model of it.
 */

import fc from "fast-check"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { discard, inprogress } from "./discard"
import { prefs } from "./prefs"

type DiscardCb = (tab?: chrome.tabs.Tab) => void
type ExecuteScriptCall = {
  func: (...args: Array<unknown>) => unknown
  args?: Array<unknown>
}

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

/** How many times the marker is stacked at the front of `title`. */
const countLeadingPrefixes = (title: string, prefix: string): number => {
  let count = 0
  let rest = title
  while (rest.startsWith(`${prefix} `)) {
    count += 1
    rest = rest.slice(prefix.length + 1)
  }
  return count
}

beforeEach(() => {
  vi.clearAllMocks()
  discard.count = 0
  discard.time = 0
  discard.tabs.length = 0
  inprogress.clear()
  prefs.prepends = "💤"
  document.title = "Example"

  vi.mocked(chrome.storage.local.get).mockImplementation(
    (_keys: unknown, cb: (items: Record<string, unknown>) => void) => cb({})
  )

  // Invoke the real injected closures against jsdom's real `document` instead
  // of stubbing executeScript out entirely — a passing test here proves the
  // shipped mark/unmark functions are idempotent, not a reimplementation.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  vi.mocked(chrome.scripting.executeScript).mockImplementation(((
    opts: ExecuteScriptCall
  ) => {
    const result = opts.func(...(opts.args ?? []))
    return Promise.resolve([{ frameId: 0, result }])
  }) as never)
})

afterEach(() => {
  prefs.prepends = ""
})

describe("discard — marker idempotency under repeated attempts", () => {
  it("never stacks the marker across repeated suspend attempts on a stale tab snapshot", async () => {
    // A caller that never re-queries the tab between attempts (its snapshot's
    // `discarded` flag stays false forever) models exactly the out-of-order/
    // stale-event surface real browser extensions live with.
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 4 }), async (attempts) => {
        document.title = "Example"
        discard.count = 0
        discard.tabs.length = 0
        inprogress.clear()

        const t = tab({
          id: 950,
          url: "https://example.com/",
          title: "Example",
        })

        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        vi.mocked(chrome.tabs.discard).mockImplementation(((
          _id: number,
          cb: DiscardCb
        ) => cb(undefined)) as never)

        for (let i = 0; i < attempts; i += 1) {
          await discard(t)
          // Simulate enough real time passing between independent requests
          // that the debounce would have cleared regardless of its mechanism.
          inprogress.clear()
        }

        expect(countLeadingPrefixes(document.title, "💤")).toBeLessThanOrEqual(
          1
        )
      })
    )
  })
})

describe("discard — in-flight re-entry", () => {
  it("does not let a second request re-enter while the first is still mid-flight", async () => {
    vi.useFakeTimers()
    try {
      const t = tab({ id: 960, url: "https://example.com/", title: "Example" })
      const pending: Array<() => void> = []
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      vi.mocked(chrome.tabs.discard).mockImplementation(((
        _id: number,
        cb: DiscardCb
      ) => {
        pending.push(() => cb(undefined))
      }) as never)

      void discard(t)
      // Past the legacy fixed debounce window (2000ms) — the first request's
      // chrome.tabs.discard callback still has not fired.
      await vi.advanceTimersByTimeAsync(3000)

      void discard(t)
      await vi.advanceTimersByTimeAsync(0)

      expect(chrome.scripting.executeScript).toHaveBeenCalledTimes(1)

      pending.splice(0).forEach((resolve) => resolve())
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("discard — queue de-duplication", () => {
  it("never queues the same tab twice while a suspend is already pending for it", async () => {
    // simultaneous-jobs = 0 forces every request behind the first into the
    // queue, regardless of which tab it is for.
    vi.mocked(chrome.storage.local.get).mockImplementation(
      (_keys: unknown, cb: (items: Record<string, unknown>) => void) =>
        cb({ "simultaneous-jobs": 0 })
    )
    vi.mocked(chrome.tabs.discard).mockImplementation(() => {
      // never calls back — the occupying tab holds the only slot forever
    })

    vi.useFakeTimers()
    try {
      const occupying = tab({ id: 100, url: "https://occupy.example.com/" })
      const t = tab({ id: 101, url: "https://example.com/" })

      void discard(occupying)
      await vi.advanceTimersByTimeAsync(0)

      void discard(t) // queued
      await vi.advanceTimersByTimeAsync(0)

      // Past the legacy fixed debounce window — a naive time-based release
      // would have cleared `inprogress` for tab 101 here even though it is
      // still sitting untouched in the queue.
      await vi.advanceTimersByTimeAsync(3000)

      void discard(t) // duplicate request for the SAME still-queued tab
      await vi.advanceTimersByTimeAsync(0)

      expect(discard.tabs.filter((qt) => qt.id === 101)).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
