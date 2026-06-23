// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { afterEach, describe, expect, it, vi } from "vitest"

import { prefs } from "./prefs"
import { log, match, query } from "./utils"

afterEach(() => {
  vi.clearAllMocks()
  prefs.log = false
})

describe("match", () => {
  it("matches a plain hostname entry", () => {
    expect(match(["example.com"], "example.com", "https://example.com/a")).toBe(
      true
    )
  })

  it("does not match a different hostname", () => {
    expect(match(["example.com"], "other.com", "https://other.com/")).toBe(
      false
    )
  })

  it("matches a re: regexp rule against the href", () => {
    expect(
      match(
        ["re:^https://example\\.com/secure"],
        "example.com",
        "https://example.com/secure/x"
      )
    ).toBe(true)
  })

  it("ignores invalid regexp rules without throwing", () => {
    expect(match(["re:[unclosed"], "example.com", "https://example.com/")).toBe(
      false
    )
  })
})

describe("query", () => {
  it("resolves with the tabs returned by chrome.tabs.query", async () => {
    const tabs: Array<chrome.tabs.Tab> = []
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    vi.mocked(chrome.tabs.query).mockImplementation(((
      _opts: unknown,
      cb: (t: Array<chrome.tabs.Tab>) => void
    ) => cb(tabs)) as never)

    await expect(query({ currentWindow: true })).resolves.toBe(tabs)
  })
})

describe("log", () => {
  it("logs only when prefs.log is enabled", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined)

    prefs.log = false
    log("hidden")
    expect(spy).not.toHaveBeenCalled()

    prefs.log = true
    log("visible")
    expect(spy).toHaveBeenCalledOnce()

    spy.mockRestore()
  })
})
