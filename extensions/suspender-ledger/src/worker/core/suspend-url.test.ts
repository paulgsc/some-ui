// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, expect, it } from "vitest"

// parseSuspendParams lives in the page module (src/suspend/params.ts), split
// from the writer so the worker never shares a chunk with it. Importing both
// here round-trips the format and keeps the two in lockstep.
import { parseSuspendParams } from "../../suspend/params"
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

/** Split a built suspend URL into its `{ search, hash }` for the parser. */
const split = (url: string): { search: string; hash: string } => {
  const u = new URL(url)
  return { search: u.search, hash: u.hash }
}

describe("buildSuspendUrl", () => {
  it("carries the address in the hash, never the query string", () => {
    const url = buildSuspendUrl(tab({ url: "https://example.com/article" }), "")
    expect(new URL(url).search).toBe("")
    expect(url).toContain("#")
  })

  it("embeds the original address as the readable, unencoded hash tail", () => {
    const target = "https://example.com/article"
    const url = buildSuspendUrl(tab({ url: target }), "💤")
    // The whole address shows through — no %3A%2F%2F soup (#339).
    expect(url).toContain(`uri=${target}`)
  })

  it("keeps a query string in the original address intact after uri=", () => {
    const target = "https://example.com/search?a=1&b=2&c=3"
    const url = buildSuspendUrl(tab({ title: "Q", url: target }), "💤")
    const { search, hash } = split(url)
    expect(parseSuspendParams(search, hash).url).toBe(target)
  })

  it("prefixes the tab title with the marker", () => {
    const url = buildSuspendUrl(
      tab({ title: "My Tab", url: "https://example.com/" }),
      "💤"
    )
    const { search, hash } = split(url)
    expect(parseSuspendParams(search, hash).title).toBe("💤 My Tab")
  })

  it("falls back to a literal marker so the title is never verbatim", () => {
    // An empty user marker must not yield the bare original title (#317).
    const url = buildSuspendUrl(
      tab({ title: "My Tab", url: "https://example.com/" }),
      ""
    )
    const { search, hash } = split(url)
    expect(parseSuspendParams(search, hash).title).toBe("[Suspended] My Tab")
  })

  it("uses only the marker when the tab has no title", () => {
    const url = buildSuspendUrl(tab({ url: "https://example.com/" }), "💤")
    const { search, hash } = split(url)
    expect(parseSuspendParams(search, hash).title).toBe("💤")
  })

  it("never embeds a favicon", () => {
    const url = buildSuspendUrl(
      tab({ url: "https://example.com/", favIconUrl: "https://e/favicon.ico" }),
      "💤"
    )
    expect(url).not.toContain("favicon")
    expect(url).not.toContain("favIconUrl")
  })

  it("points to the extension suspend.html", () => {
    const url = buildSuspendUrl(tab({ url: "https://example.com/" }), "💤")
    expect(url).toContain("suspend.html")
    expect(url.startsWith("moz-extension://")).toBe(true)
  })
})

describe("parseSuspendParams", () => {
  it("round-trips a build through to the original url and title", () => {
    const target = "https://example.com/a/b?x=1&y=2#frag"
    const url = buildSuspendUrl(tab({ title: "Round", url: target }), "💤")
    const { search, hash } = split(url)
    expect(parseSuspendParams(search, hash)).toEqual({
      url: target,
      title: "💤 Round",
    })
  })

  it("returns an empty url when there is no address (recovery)", () => {
    expect(parseSuspendParams("", "#title=Orphan")).toEqual({
      url: "",
      title: "Orphan",
    })
  })

  it("still reads the legacy query form for tabs from an older build", () => {
    const search = "?url=https%3A%2F%2Fexample.com%2F&title=Old&favicon=x"
    expect(parseSuspendParams(search, "")).toEqual({
      url: "https://example.com/",
      title: "Old",
    })
  })

  it("returns empty params for a bare suspend.html", () => {
    expect(parseSuspendParams("", "")).toEqual({ url: "", title: "" })
  })
})

describe("isSuspendTab", () => {
  it("returns true for a tab on the new hash-form suspend page", () => {
    const suspendUrl = `moz-extension://testid/suspend.html#uri=https://example.com/`
    expect(isSuspendTab(tab({ url: suspendUrl }))).toBe(true)
  })

  it("returns true for a tab on the legacy query-form suspend page", () => {
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
