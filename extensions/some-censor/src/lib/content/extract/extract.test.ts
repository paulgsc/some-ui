/**
 * Extraction against both YouTube generations.
 *
 * Adding the Lit-era tags to the catalogue (#973) only masks those cards; it
 * does not make them *readable*. Their title is an anchor with a BEM class
 * instead of `#video-title`, their duration is a badge instead of a thumbnail
 * overlay, and their channel is an untagged metadata run — so without matching
 * selectors, a lockup would mask correctly and then reveal an empty meta chip
 * and a blank title, which is arguably worse than not masking it at all.
 *
 * The Polymer cases are here too, as the regression floor: the lockup selectors
 * are appended to shared lists, and a careless edit to one of those lists is
 * the likeliest way to break the cards that already worked.
 */

import { describe, expect, it } from "vitest"

import { extractMeta, extractTitle, tryExtract } from "./index"

function make(tag: string, html: string): HTMLElement {
  const el = document.createElement(tag)
  el.innerHTML = html
  // jsdom resolves relative hrefs against the document base, which is what the
  // extractors read via `a.href`.
  return el
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures shaped like the real markup
// ─────────────────────────────────────────────────────────────────────────────

const POLYMER = `
  <span class="ytd-thumbnail-overlay-time-status-renderer">12:34</span>
  <a id="video-title" href="/watch?v=poly_1">How Compilers Work</a>
  <ytd-channel-name>
    <yt-formatted-string>LowLevelLearning</yt-formatted-string>
  </ytd-channel-name>
  <a href="/channel/UC4DVVoMDcpAHJBKP0ZrEIog">LowLevelLearning</a>
  <div id="metadata-line"><span>1.2M views</span><span>3 days ago</span></div>`

const LOCKUP = `
  <a class="yt-lockup-view-model__content-image" href="/watch?v=lock_1"></a>
  <div class="ytThumbnailOverlayBadgeViewModelHost">
    <div class="badge-shape-wiz__text">10:11</div>
  </div>
  <div class="yt-lockup-metadata-view-model__metadata">
    <h3>
      <a class="yt-lockup-metadata-view-model__title" href="/watch?v=lock_1">
        <span role="text">Everything About Lockups</span>
      </a>
    </h3>
    <div class="yt-content-metadata-view-model__metadata-row">
      <a class="yt-content-metadata-view-model__metadata-text" href="/@Lockups">
        Lockups Channel
      </a>
    </div>
    <div class="yt-content-metadata-view-model__metadata-row">
      <span class="yt-content-metadata-view-model__metadata-text">890K views</span>
      <span class="yt-content-metadata-view-model__metadata-text">2 weeks ago</span>
    </div>
  </div>`

const SHORTS_LOCKUP = `
  <a href="/shorts/short_1"></a>
  <div class="shortsLockupViewModelHostMetadataTitle">A very short video</div>`

// ─────────────────────────────────────────────────────────────────────────────

describe("tryExtract", () => {
  it("fully resolves a Polymer renderer", () => {
    const out = tryExtract(make("ytd-rich-item-renderer", POLYMER))
    expect(out.kind).toBe("full")
    expect(out.videoId).toBe("poly_1")
    expect(out.channelId).toBe("UC4DVVoMDcpAHJBKP0ZrEIog")
  })

  it("fully resolves a video lockup", () => {
    const out = tryExtract(make("yt-lockup-view-model", LOCKUP))
    expect(out.kind).toBe("full")
    expect(out.videoId).toBe("lock_1")
    expect(out.channelId).toBe("@Lockups")
  })

  it("resolves a shorts lockup as video-only", () => {
    // A shorts card exposes no channel at all. It must still mask — masking
    // only ever needed the videoId — and it must not claim a channel it does
    // not have, because that value feeds channel whitelisting.
    const out = tryExtract(
      make("ytm-shorts-lockup-view-model-v2", SHORTS_LOCKUP)
    )
    expect(out.kind).toBe("video-only")
    expect(out.videoId).toBe("short_1")
    expect(out.channelId).toBeNull()
  })

  it("resolves nothing from a lockup that is not a video", () => {
    const channelLockup = make(
      "yt-lockup-view-model",
      '<a href="/@SomeChannel">Some Channel</a>'
    )
    expect(tryExtract(channelLockup).kind).toBe("raw")
  })
})

describe("extractTitle", () => {
  it("reads a Polymer title", () => {
    expect(extractTitle(make("ytd-rich-item-renderer", POLYMER))).toBe(
      "How Compilers Work"
    )
  })

  it("reads a lockup title", () => {
    expect(extractTitle(make("yt-lockup-view-model", LOCKUP))).toBe(
      "Everything About Lockups"
    )
  })

  it("reads a shorts lockup title", () => {
    expect(
      extractTitle(make("ytm-shorts-lockup-view-model-v2", SHORTS_LOCKUP))
    ).toBe("A very short video")
  })

  it("returns null rather than empty text", () => {
    expect(extractTitle(make("yt-lockup-view-model", "<h3><a></a></h3>"))).toBe(
      null
    )
  })
})

describe("extractMeta", () => {
  it("reads all three fields off a Polymer renderer", () => {
    expect(extractMeta(make("ytd-rich-item-renderer", POLYMER))).toEqual({
      channelName: "LowLevelLearning",
      duration: "12:34",
      uploadDate: "3 days ago",
    })
  })

  it("reads all three fields off a lockup", () => {
    expect(extractMeta(make("yt-lockup-view-model", LOCKUP))).toEqual({
      channelName: "Lockups Channel",
      duration: "10:11",
      uploadDate: "2 weeks ago",
    })
  })

  it("takes the age, not the view count, from the lockup's second row", () => {
    // Both are `…__metadata-text` spans in the same row. Picking the first
    // would put "890K views" where the date belongs — and view counts are
    // exactly the popularity signal this extension exists to withhold.
    expect(extractMeta(make("yt-lockup-view-model", LOCKUP)).uploadDate).toBe(
      "2 weeks ago"
    )
  })

  it("is position-independent about which row holds the channel", () => {
    // The same lockup with its rows swapped: YouTube orders these differently
    // across surfaces, and a :nth-child selector would follow the order rather
    // than the meaning.
    const swapped = LOCKUP.replace(
      /<div class="yt-content-metadata-view-model__metadata-row">[\s\S]*?<\/div>\s*<div class="yt-content-metadata-view-model__metadata-row">[\s\S]*?<\/div>/,
      `<div class="yt-content-metadata-view-model__metadata-row">
         <span class="yt-content-metadata-view-model__metadata-text">890K views</span>
       </div>
       <div class="yt-content-metadata-view-model__metadata-row">
         <a class="yt-content-metadata-view-model__metadata-text" href="/@Lockups">Lockups Channel</a>
       </div>`
    )
    expect(extractMeta(make("yt-lockup-view-model", swapped)).channelName).toBe(
      "Lockups Channel"
    )
  })

  it("returns nulls rather than throwing on a card with no metadata", () => {
    expect(extractMeta(make("yt-lockup-view-model", SHORTS_LOCKUP))).toEqual({
      channelName: null,
      duration: null,
      uploadDate: null,
    })
  })
})
