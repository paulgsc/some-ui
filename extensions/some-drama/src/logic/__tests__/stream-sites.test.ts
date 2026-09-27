import { isStreamSite, siteOf, withStreamSite } from "@drama/logic/stream-sites"
import { describe, expect, it } from "vitest"

describe("siteOf", () => {
  it("is the hostname without www", () => {
    expect(siteOf("https://www.viki.com/videos/123")).toBe("viki.com")
    expect(siteOf("https://m.YouTube.com/watch?v=x")).toBe("m.youtube.com")
  })

  it("is empty for pages that are not a web site", () => {
    expect(siteOf("about:blank")).toBe("")
    expect(siteOf("moz-extension://abc/popup.html")).toBe("")
    expect(siteOf("not a url")).toBe("")
  })
})

describe("isStreamSite", () => {
  const sites = ["viki.com", "iq.com"]

  it("is false by default — no sites marked", () => {
    expect(isStreamSite("https://www.netflix.com/watch/1", [])).toBe(false)
  })

  it("matches a marked site and its subdomains", () => {
    expect(isStreamSite("https://www.viki.com/videos/1", sites)).toBe(true)
    expect(isStreamSite("https://m.viki.com/videos/1", sites)).toBe(true)
  })

  it("does not match a lookalike", () => {
    expect(isStreamSite("https://notviki.com/", sites)).toBe(false)
    expect(isStreamSite("https://viki.com.evil.test/", sites)).toBe(false)
  })
})

describe("withStreamSite", () => {
  it("marks, deduplicates and sorts", () => {
    expect(withStreamSite(["viki.com"], "iq.com", true)).toEqual([
      "iq.com",
      "viki.com",
    ])
    expect(withStreamSite(["viki.com"], "viki.com", true)).toEqual(["viki.com"])
  })

  it("unmarks", () => {
    expect(withStreamSite(["iq.com", "viki.com"], "viki.com", false)).toEqual([
      "iq.com",
    ])
  })

  it("ignores an empty site", () => {
    expect(withStreamSite([], "", true)).toEqual([])
  })
})
