// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, it } from "vitest"

import { buildSuspendUrl, isSuspendTab } from "./suspend-url"

const tab = (over: Partial<chrome.tabs.Tab> = {}): chrome.tabs.Tab => ({
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

describe("buildSuspendUrl", () => {
  it("embeds the original url as a query param", () => {
    const url = buildSuspendUrl(tab({ url: "https://example.com/article" }), "")
    const params = new URL(url).searchParams
    expect(params.get("url")).toBe("https://example.com/article")
  })

  it("prefixes the tab title with the marker", () => {
    const url = buildSuspendUrl(
      tab({ title: "My Tab", url: "https://example.com/" }),
      "💤"
    )
    const params = new URL(url).searchParams
    expect(params.get("title")).toBe("💤 My Tab")
  })

  it("omits title param when marker and tab title are both empty", () => {
    const url = buildSuspendUrl(tab({ url: "https://example.com/" }), "")
    const params = new URL(url).searchParams
    expect(params.has("title")).toBe(false)
  })

  it("uses only the marker when the tab has no title", () => {
    const url = buildSuspendUrl(tab({ url: "https://example.com/" }), "💤")
    const params = new URL(url).searchParams
    expect(params.get("title")).toBe("💤")
  })

  it("embeds the favicon when the tab has one", () => {
    const favicon = "https://example.com/favicon.ico"
    const url = buildSuspendUrl(
      tab({ url: "https://example.com/", favIconUrl: favicon }),
      "💤"
    )
    const params = new URL(url).searchParams
    expect(params.get("favicon")).toBe(favicon)
  })

  it("omits the favicon param when the tab has no favicon", () => {
    const url = buildSuspendUrl(tab({ url: "https://example.com/" }), "💤")
    const params = new URL(url).searchParams
    expect(params.has("favicon")).toBe(false)
  })

  it("points to the extension suspend.html", () => {
    const url = buildSuspendUrl(tab({ url: "https://example.com/" }), "💤")
    expect(url).toContain("suspend.html")
    expect(url.startsWith("moz-extension://")).toBe(true)
  })
})

describe("isSuspendTab", () => {
  it("returns true for a tab already on the suspend page", () => {
    const suspendUrl = `moz-extension://testid/suspend.html?url=https%3A%2F%2Fexample.com%2F`
    expect(isSuspendTab(tab({ url: suspendUrl }))).toBe(true)
  })

  it("returns false for a regular http tab", () => {
    expect(isSuspendTab(tab({ url: "https://example.com/" }))).toBe(false)
  })

  it("returns false when url is undefined", () => {
    expect(isSuspendTab(tab({ url: undefined }))).toBe(false)
  })
})
