// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { beforeEach, describe, expect, it, vi } from "vitest"

import { discard, inprogress } from "../core/discard"
import { number } from "./number"

type DiscardCb = (tab?: chrome.tabs.Tab) => void
type QueryCb = (tabs: Array<chrome.tabs.Tab>) => void
type StorageCb = (items: Record<string, unknown>) => void

const flush = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0))

/** Build a minimal chrome.tabs.Tab with sensible defaults. */
const makeTab = (over: Partial<chrome.tabs.Tab> = {}): chrome.tabs.Tab => ({
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
  status: "complete",
  url: "https://example.com/",
  ...over,
})

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

  // The chrome typings surface only the promise overload for tabs.query, so the
  // callback-form implementation needs an assertion (same pattern as discard.test.ts).
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  vi.mocked(chrome.tabs.query).mockImplementation(((
    _opts: unknown,
    cb: QueryCb
  ) => cb([])) as never)

  // scripting.executeScript injects the meta collector (func form); the Chrome
  // typings mark it as returning void but number.ts awaits the result, so the
  // mock must return a real Promise of per-frame results.
  vi.mocked(chrome.scripting.executeScript).mockImplementation(
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    () => Promise.resolve(readyResult())
  )

  // tabs.discard (the suspend action) resolves its callback immediately. The
  // chrome typings surface only the promise overload, so the callback form
  // needs an assertion (same pattern as chrome.tabs.query above).
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  vi.mocked(chrome.tabs.discard).mockImplementation(((
    _id: number,
    cb: DiscardCb
  ) => cb(undefined)) as never)
})

describe("number.check — auto-discard", () => {
  it("suspends an idle background tab that has exceeded the age threshold", async () => {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    vi.mocked(chrome.tabs.query).mockImplementation(((
      _opts: unknown,
      cb: QueryCb
    ) => cb([makeTab({ id: 10 })])) as never)

    // number: 0 so 1 candidate > 0 threshold → proceeds to suspend
    await number.check(undefined, { number: 0 })
    await flush()

    expect(chrome.tabs.discard).toHaveBeenCalledWith(10, expect.any(Function))
    expect(chrome.tabs.remove).not.toHaveBeenCalled()
  })

  it("skips a tab whose meta.ready is false (collector not yet injected)", async () => {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    vi.mocked(chrome.tabs.query).mockImplementation(((
      _opts: unknown,
      cb: QueryCb
    ) => cb([makeTab({ id: 11 })])) as never)
    vi.mocked(chrome.scripting.executeScript).mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      () => Promise.resolve(readyResult({ ready: false }))
    )

    await number.check(undefined, { number: 0 })
    await flush()

    expect(chrome.tabs.discard).not.toHaveBeenCalled()
  })

  it("skips a tab that is too young (within the period threshold)", async () => {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    vi.mocked(chrome.tabs.query).mockImplementation(((
      _opts: unknown,
      cb: QueryCb
    ) => cb([makeTab({ id: 12 })])) as never)
    vi.mocked(chrome.scripting.executeScript).mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      () => Promise.resolve(readyResult({ time: Date.now() - 60 * 1000 }))
    )

    await number.check(undefined, { number: 0 })
    await flush()

    expect(chrome.tabs.discard).not.toHaveBeenCalled()
  })

  it("skips a tab with unsaved form input when form guard is on", async () => {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    vi.mocked(chrome.tabs.query).mockImplementation(((
      _opts: unknown,
      cb: QueryCb
    ) => cb([makeTab({ id: 13 })])) as never)
    vi.mocked(chrome.scripting.executeScript).mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      () => Promise.resolve(readyResult({ forms: true }))
    )

    await number.check(undefined, { number: 0 })
    await flush()

    expect(chrome.tabs.discard).not.toHaveBeenCalled()
  })

  it("does not suspend when tab count is at or below the threshold", async () => {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    vi.mocked(chrome.tabs.query).mockImplementation(((
      _opts: unknown,
      cb: QueryCb
    ) => cb([])) as never)

    await number.check()
    await flush()

    expect(chrome.tabs.discard).not.toHaveBeenCalled()
  })

  it("suspends the oldest tab first when multiple candidates exist", async () => {
    const older = makeTab({ id: 20, url: "https://old.example.com/" })
    const newer = makeTab({ id: 21, url: "https://new.example.com/" })
    const now = Date.now()

    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    vi.mocked(chrome.tabs.query).mockImplementation(((
      _opts: unknown,
      cb: QueryCb
    ) => cb([older, newer])) as never)
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

    expect(chrome.tabs.discard).toHaveBeenCalledWith(20, expect.any(Function))
    expect(chrome.tabs.discard).not.toHaveBeenCalledWith(
      21,
      expect.any(Function)
    )
  })

  it("never calls chrome.tabs.remove (never-close invariant)", async () => {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    vi.mocked(chrome.tabs.query).mockImplementation(((
      _opts: unknown,
      cb: QueryCb
    ) => cb([makeTab({ id: 30 })])) as never)

    await number.check(undefined, { number: 0 })
    await flush()

    expect(chrome.tabs.remove).not.toHaveBeenCalled()
  })

  it("uses tab.lastAccessed as age fallback when meta.time is undefined (pre-existing tab)", async () => {
    const lastAccessed = Date.now() - 30 * 60 * 1000 // 30 min ago — older than period
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    vi.mocked(chrome.tabs.query).mockImplementation(((
      _opts: unknown,
      cb: QueryCb
    ) => cb([makeTab({ id: 50, lastAccessed })])) as never)
    vi.mocked(chrome.scripting.executeScript).mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      () => Promise.resolve(readyResult({ time: undefined }))
    )

    // number: 0 so 1 candidate > 0 threshold; tab.lastAccessed is 30 min old
    await number.check(undefined, { number: 0 })
    await flush()

    expect(chrome.tabs.discard).toHaveBeenCalledWith(50, expect.any(Function))
  })

  it("skips a pre-existing tab that is too young by tab.lastAccessed", async () => {
    const lastAccessed = Date.now() - 60 * 1000 // 1 min ago — within period
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    vi.mocked(chrome.tabs.query).mockImplementation(((
      _opts: unknown,
      cb: QueryCb
    ) => cb([makeTab({ id: 51, lastAccessed })])) as never)
    vi.mocked(chrome.scripting.executeScript).mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      () => Promise.resolve(readyResult({ time: undefined }))
    )

    await number.check(undefined, { number: 0 })
    await flush()

    expect(chrome.tabs.discard).not.toHaveBeenCalled()
  })

  it("respects ignore.ready.state override — suspends even when meta.ready is false", async () => {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    vi.mocked(chrome.tabs.query).mockImplementation(((
      _opts: unknown,
      cb: QueryCb
    ) => cb([makeTab({ id: 40 })])) as never)
    vi.mocked(chrome.scripting.executeScript).mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      () => Promise.resolve(readyResult({ ready: false }))
    )

    // number: 0 so 1 candidate > 0 threshold; ignore.ready.state bypasses guard
    await number.check(undefined, { "ignore.ready.state": true, number: 0 })
    await flush()

    expect(chrome.tabs.discard).toHaveBeenCalledWith(40, expect.any(Function))
    expect(chrome.tabs.remove).not.toHaveBeenCalled()
  })
})
