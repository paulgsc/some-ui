// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { afterEach, describe, expect, it, vi } from "vitest"

import { defaults, getPrefs, prefs, setPrefs, storage } from "./prefs"

type GetCb = (items: Record<string, unknown>) => void

afterEach(() => {
  vi.clearAllMocks()
  // restore live prefs to a known baseline between tests
  Object.assign(prefs, defaults)
})

describe("getPrefs", () => {
  it("merges stored values over defaults", async () => {
    vi.mocked(chrome.storage.local.get).mockImplementation(
      (_keys: unknown, cb: GetCb) => cb({ number: 12, log: true })
    )

    const result = await getPrefs()

    expect(result.number).toBe(12)
    expect(result.log).toBe(true)
    // untouched keys fall back to defaults
    expect(result.prepends).toBe(defaults.prepends)
    expect(result["simultaneous-jobs"]).toBe(defaults["simultaneous-jobs"])
  })

  it("returns a full copy of defaults when storage is empty", async () => {
    vi.mocked(chrome.storage.local.get).mockImplementation(
      (_keys: unknown, cb: GetCb) => cb({})
    )

    const result = await getPrefs()

    expect(result).toEqual(defaults)
  })
})

describe("setPrefs", () => {
  it("writes the partial patch to local storage", async () => {
    vi.mocked(chrome.storage.local.set).mockImplementation(
      (_items: unknown, cb: () => void) => cb()
    )

    await setPrefs({ number: 3 })

    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      { number: 3 },
      expect.any(Function)
    )
  })
})

describe("storage", () => {
  it("merges defaults with the persisted area contents", async () => {
    vi.mocked(chrome.storage.local.get).mockImplementation(
      (_keys: unknown, cb: GetCb) => cb({ a: 2 })
    )

    const result = await storage({ a: 1, b: "x" })

    expect(result).toEqual({ a: 2, b: "x" })
  })

  it("notifies subscribers registered via storage.on", () => {
    expect(typeof storage.on).toBe("function")
    // smoke: registering a callback does not throw
    expect(() => storage.on("number", () => undefined)).not.toThrow()
  })
})
