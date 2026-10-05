// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { tab } from "@suspender/worker/core/__tests__/tab"
import { discard, inprogress } from "@suspender/worker/core/discard"
import { number } from "@suspender/worker/modes/number"
import { beforeEach, describe, expect, it, vi } from "vitest"

type QueryCb = (tabs: Array<chrome.tabs.Tab>) => void
type StorageCb = (items: Record<string, unknown>) => void

const flush = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0))

/** A loaded background tab on example.com. */
const makeTab = (over: Partial<chrome.tabs.Tab> = {}): chrome.tabs.Tab =>
  tab({ status: "complete", url: "https://example.com/", ...over })

/** Stub collector result: a page that is ready and 20 minutes idle. */
const readyResult = (
  over: Record<string, unknown> = {}
): Array<{ result: unknown }> => [
  {
    result: {
      ready: true,
      time: Date.now() - 20 * 60 * 1000,
      forms: false,
      audible: false,
      paused: false,
      permission: false,
      ...over,
    },
  },
]

beforeEach(() => {
  // Any test that installs fake timers must not be able to leak them into the
  // next one, even if it fails before its own cleanup runs.
  vi.useRealTimers()
  vi.clearAllMocks()
  discard.count = 0
  discard.time = 0
  discard.tabs.length = 0
  inprogress.clear()

  // storage.local.get / session.get: the callback overload matches without an
  // assertion.
  vi.mocked(chrome.storage.local.get).mockImplementation(
    (_keys: unknown, cb: StorageCb) =>
      cb({
        mode: "time-based",
        number: 1,
        "max.single.discard": 50,
        period: 10 * 60,
        audio: true,
        paused: false,
        pinned: false,
        battery: false,
        online: false,
        form: true,
        whitelist: [],
        "notification.permission": false,
        "whitelist-url": [],
        "memory-enabled": false,
        "memory-value": 60,
        idle: false,
        "idle-timeout": 5 * 60,
        "exclude-active": true,
        "icon-update": false,
      })
  )
  vi.mocked(chrome.storage.session.get).mockImplementation(
    (_keys: unknown, cb: StorageCb) => cb({ "whitelist.session": [] })
  )

  withTabs()

  // scripting.executeScript injects the meta collector (func form); the Chrome
  // typings mark it as returning void but number.ts awaits the result, so the
  // mock must return a real Promise of per-frame results.
  vi.mocked(chrome.scripting.executeScript).mockImplementation(
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    () => Promise.resolve(readyResult())
  )

  // tabs.discard resolves immediately, promise form only (see
  // discard-adapter.ts → discardOnce).
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  vi.mocked(chrome.tabs.discard).mockImplementation((id?: number) =>
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    Promise.resolve({ id, discarded: true } as chrome.tabs.Tab)
  )
})

/** Make `tabs.query` answer with `tabs`. */
function withTabs(...tabs: Array<chrome.tabs.Tab>): void {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  vi.mocked(chrome.tabs.query).mockImplementation(((
    _opts: unknown,
    cb: QueryCb
  ) => cb(tabs)) as never)
}

/** Make every collector probe answer {@link readyResult} with `over`. */
function withMeta(over: Record<string, unknown>): void {
  vi.mocked(chrome.scripting.executeScript).mockImplementation(
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    () => Promise.resolve(readyResult(over))
  )
}

describe("number.check — auto-discard", () => {
  it("suspends an idle background tab that has exceeded the age threshold", async () => {
    withTabs(makeTab({ id: 10 }))

    // number: 0 so 1 candidate > 0 threshold → proceeds to suspend
    await number.check(undefined, { number: 0 })
    await flush()

    expect(chrome.tabs.discard).toHaveBeenCalledWith(10)
    expect(chrome.tabs.remove).not.toHaveBeenCalled()
  })

  it("does not let a tab that never answers stall the rest of the sweep", async () => {
    // A wedged content process: executeScript neither resolves nor rejects.
    // Awaited unguarded, it would end the sweep for every tab after it.
    vi.useFakeTimers()
    try {
      withTabs(...Array.from({ length: 8 }, (_, i) => makeTab({ id: 10 + i })))

      vi.mocked(chrome.scripting.executeScript).mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        (injection: { target?: { tabId?: number } }) =>
          injection.target?.tabId === 10
            ? new Promise(() => undefined)
            : Promise.resolve(readyResult())
      )

      const sweep = number.check(undefined, { number: 0 })
      await vi.advanceTimersByTimeAsync(10_000)
      await sweep

      // The sweep resolved at all, and every tab behind the wedged one was
      // still judged.
      for (const id of [11, 12, 13, 14, 15, 16, 17]) {
        expect(chrome.tabs.discard).toHaveBeenCalledWith(id)
      }
      // The unanswerable tab is passed over, not suspended blind: we cannot see
      // unsaved form input in a page that will not talk to us.
      expect(chrome.tabs.discard).not.toHaveBeenCalledWith(10)
    } finally {
      vi.useRealTimers()
    }
  })

  it.each([
    [
      "skips a tab whose meta.ready is false (collector not yet injected)",
      { id: 11 },
      { ready: false },
    ],
    [
      "skips a tab that is too young (within the period threshold)",
      { id: 12 },
      { time: Date.now() - 60 * 1000 },
    ],
    [
      "skips a tab with unsaved form input when form guard is on",
      { id: 13 },
      { forms: true },
    ],
    [
      "skips a pre-existing tab that is too young by tab.lastAccessed",
      { id: 51, lastAccessed: Date.now() - 60 * 1000 }, // 1 min ago — within period
      { time: undefined },
    ],
  ] satisfies Array<
    [string, Partial<chrome.tabs.Tab>, Record<string, unknown>]
  >)("%s", async (_title, tabOver, meta) => {
    withTabs(makeTab(tabOver))
    withMeta(meta)

    await number.check(undefined, { number: 0 })
    await flush()

    expect(chrome.tabs.discard).not.toHaveBeenCalled()
  })

  it("does not suspend when tab count is at or below the threshold", async () => {
    withTabs()

    await number.check()
    await flush()

    expect(chrome.tabs.discard).not.toHaveBeenCalled()
  })

  it("suspends the oldest tab first when multiple candidates exist", async () => {
    const older = makeTab({ id: 20, url: "https://old.example.com/" })
    const newer = makeTab({ id: 21, url: "https://new.example.com/" })
    const now = Date.now()

    withTabs(older, newer)
    vi.mocked(chrome.scripting.executeScript).mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      (opts: chrome.scripting.ScriptInjection<Array<unknown>, unknown>) => {
        const time =
          opts.target.tabId === 20 ? now - 30 * 60 * 1000 : now - 20 * 60 * 1000
        return Promise.resolve(readyResult({ time }))
      }
    )

    // number=1 → 2 candidates, 1 threshold: oldest (id=20) suspended first
    await number.check()
    await flush()

    expect(chrome.tabs.discard).toHaveBeenCalledWith(20)
    expect(chrome.tabs.discard).not.toHaveBeenCalledWith(
      21,
      expect.any(Function)
    )
  })

  it("never calls chrome.tabs.remove (never-close invariant)", async () => {
    withTabs(makeTab({ id: 30 }))

    await number.check(undefined, { number: 0 })
    await flush()

    expect(chrome.tabs.remove).not.toHaveBeenCalled()
  })

  it("uses tab.lastAccessed as age fallback when meta.time is undefined (pre-existing tab)", async () => {
    const lastAccessed = Date.now() - 30 * 60 * 1000 // 30 min ago — older than period
    withTabs(makeTab({ id: 50, lastAccessed }))
    withMeta({ time: undefined })

    // number: 0 so 1 candidate > 0 threshold; tab.lastAccessed is 30 min old
    await number.check(undefined, { number: 0 })
    await flush()

    expect(chrome.tabs.discard).toHaveBeenCalledWith(50)
  })

  it("respects ignore.ready.state override — suspends even when meta.ready is false", async () => {
    withTabs(makeTab({ id: 40 }))
    withMeta({ ready: false })

    // number: 0 so 1 candidate > 0 threshold; ignore.ready.state bypasses guard
    await number.check(undefined, { "ignore.ready.state": true, number: 0 })
    await flush()

    expect(chrome.tabs.discard).toHaveBeenCalledWith(40)
    expect(chrome.tabs.remove).not.toHaveBeenCalled()
  })
})
