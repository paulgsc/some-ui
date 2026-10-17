/**
 * Extraction against both YouTube generations.
 *
 * Masking the Lit-era tags does not make them *readable*. Their title is an
 * anchor with a BEM class
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

import {
  extractIsShort,
  extractMeta,
  extractTitle,
  extractUploadDate,
  tryExtract,
} from "./index"

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

// The camelCase spelling, cut down from a live capture of youtube.com on
// 2026-10-17 (a channel page's Videos tab), with the classes and attributes
// the extractors could plausibly read kept as served. The channel run is a
// link here, as on the home feed and in search.
const CAMEL_LOCKUP = `
  <div class="ytLockupViewModelHost ytLockupViewModelVertical content-id-camel_1">
    <a href="/watch?v=camel_1" class="ytLockupViewModelContentImage">
      <yt-thumbnail-view-model class="ytThumbnailViewModelHost">
        <yt-thumbnail-bottom-overlay-view-model class="ytThumbnailBottomOverlayViewModelHost">
          <div class="ytThumbnailBottomOverlayViewModelBadgeContainer">
            <yt-thumbnail-badge-view-model class="ytThumbnailBadgeViewModelHost ytThumbnailBottomOverlayViewModelBadge">
              <badge-shape class="ytBadgeShapeHost ytBadgeShapeThumbnailDefault" role="img" aria-label="14 minutes, 52 seconds">
                <div class="ytBadgeShapeText">14:52</div>
              </badge-shape>
            </yt-thumbnail-badge-view-model>
          </div>
        </yt-thumbnail-bottom-overlay-view-model>
      </yt-thumbnail-view-model>
    </a>
    <div class="ytLockupViewModelMetadata">
      <yt-lockup-metadata-view-model class="ytLockupMetadataViewModelHost">
        <div class="ytLockupMetadataViewModelTextContainer">
          <h3 class="ytLockupMetadataViewModelHeadingReset" title="20 years of esports history explained">
            <a href="/watch?v=camel_1" class="ytLockupMetadataViewModelTitle" aria-label="20 years of esports history explained 14 minutes, 52 seconds">
              <span class="ytAttributedStringHost ytAttributedStringWhiteSpacePreWrap" role="text">20 years of esports history explained</span>
            </a>
          </h3>
          <div class="ytLockupMetadataViewModelMetadata">
            <yt-content-metadata-view-model class="ytContentMetadataViewModelHost">
              <div class="ytContentMetadataViewModelMetadataRow" role="group">
                <span class="ytAttributedStringHost ytContentMetadataViewModelMetadataText ytContentMetadataViewModelMetadataTextLastPart">
                  <span class=""><a class="ytAttributedStringLink" href="/@CamelChannel">Camel Channel</a></span>
                </span>
              </div>
              <div class="ytContentMetadataViewModelMetadataRow" role="group">
                <span class="ytAttributedStringHost ytContentMetadataViewModelMetadataText" aria-label="1.3 million views" role="text">1.3M</span>
                <span class="ytContentMetadataViewModelDelimiter"></span>
                <span class="ytAttributedStringHost ytContentMetadataViewModelMetadataText ytContentMetadataViewModelMetadataTextLastPart" aria-label="8 days ago" role="text">8d ago</span>
              </div>
            </yt-content-metadata-view-model>
          </div>
        </div>
      </yt-lockup-metadata-view-model>
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
    // not have.
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

  it("reads a camelCase lockup title", () => {
    expect(extractTitle(make("yt-lockup-view-model", CAMEL_LOCKUP))).toBe(
      "20 years of esports history explained"
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
  it("reads the channel and duration off a Polymer renderer", () => {
    expect(extractMeta(make("ytd-rich-item-renderer", POLYMER))).toEqual({
      channelName: "LowLevelLearning",
      duration: "12:34",
    })
    expect(extractUploadDate(make("ytd-rich-item-renderer", POLYMER))).toBe(
      "3 days ago"
    )
  })

  it("reads the channel and duration off a lockup", () => {
    expect(extractMeta(make("yt-lockup-view-model", LOCKUP))).toEqual({
      channelName: "Lockups Channel",
      duration: "10:11",
    })
  })

  it("reads the channel and duration off a camelCase lockup", () => {
    expect(extractMeta(make("yt-lockup-view-model", CAMEL_LOCKUP))).toEqual({
      channelName: "Camel Channel",
      duration: "14:52",
    })
  })

  it("takes a camelCase lockup's age from its label, not its compact text", () => {
    expect(extractUploadDate(make("yt-lockup-view-model", CAMEL_LOCKUP))).toBe(
      "8 days ago"
    )
  })

  it("takes the age, not the view count, from the lockup's second row", () => {
    // Both are `…__metadata-text` spans in the same row. Picking the first
    // would put "890K views" where the date belongs — and view counts are
    // exactly the popularity signal this extension exists to withhold.
    expect(extractUploadDate(make("yt-lockup-view-model", LOCKUP))).toBe(
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

  it("never reads a camelCase channel run as the age, in either row order", () => {
    // The channel run is a span of the same class as the age. Below the date
    // row, a channel named like an age would otherwise be read as one.
    const swapped = CAMEL_LOCKUP.replace(
      /(<div class="ytContentMetadataViewModelMetadataRow" role="group">[\s\S]*?<\/div>)(\s*)(<div class="ytContentMetadataViewModelMetadataRow" role="group">[\s\S]*?<\/div>)/,
      "$3$2$1"
    ).replace("Camel Channel", "10 Years Ago")
    expect(swapped.indexOf("10 Years Ago")).toBeGreaterThan(
      swapped.indexOf("8d ago")
    )
    expect(extractUploadDate(make("yt-lockup-view-model", swapped))).toBe(
      "8 days ago"
    )
  })

  it("never reads a BEM channel run as the age, even wrapped in a span", () => {
    const wrapped = LOCKUP.replace(
      /<div class="yt-content-metadata-view-model__metadata-row">\s*<a[\s\S]*?<\/a>\s*<\/div>/,
      ""
    ).replace(
      /(<span class="yt-content-metadata-view-model__metadata-text">2 weeks ago<\/span>\s*<\/div>)/,
      `$1
    <div class="yt-content-metadata-view-model__metadata-row">
      <span class="yt-content-metadata-view-model__metadata-text"><a href="/@x">10 years ago</a></span>
    </div>`
    )
    expect(wrapped.indexOf("10 years ago")).toBeGreaterThan(
      wrapped.indexOf("2 weeks ago")
    )
    expect(extractUploadDate(make("yt-lockup-view-model", wrapped))).toBe(
      "2 weeks ago"
    )
  })

  it("never reads a run inside a link as the age", () => {
    const linked = LOCKUP.replace(
      /(<span class="yt-content-metadata-view-model__metadata-text">2 weeks ago<\/span>\s*<\/div>)/,
      `$1
    <div class="yt-content-metadata-view-model__metadata-row">
      <a href="/@x"><span class="yt-content-metadata-view-model__metadata-text">10 years ago</span></a>
    </div>`
    )
    expect(linked).toContain("10 years ago")
    expect(extractUploadDate(make("yt-lockup-view-model", linked))).toBe(
      "2 weeks ago"
    )
  })

  it("never reads an unlabelled camelCase run, such as a plain-text channel", () => {
    // A channel's own page shows its name as plain text, with no link to
    // exclude it; the missing aria-label is what keeps it out.
    const plain = CAMEL_LOCKUP.replace(
      /(aria-label="8 days ago" role="text">8d ago<\/span>\s*<\/div>)/,
      `$1
              <div class="ytContentMetadataViewModelMetadataRow" role="group">
                <span class="ytAttributedStringHost ytContentMetadataViewModelMetadataText" role="text">10 years ago</span>
              </div>`
    )
    expect(plain).toContain("10 years ago")
    expect(extractUploadDate(make("yt-lockup-view-model", plain))).toBe(
      "8 days ago"
    )
  })

  it("returns nulls rather than throwing on a card with no metadata", () => {
    expect(extractMeta(make("yt-lockup-view-model", SHORTS_LOCKUP))).toEqual({
      channelName: null,
      duration: null,
    })
    expect(extractUploadDate(make("yt-lockup-view-model", SHORTS_LOCKUP))).toBe(
      null
    )
  })
})

describe("extractIsShort", () => {
  it("knows a Shorts renderer, and any card linking to /shorts/", () => {
    expect(extractIsShort(make("ytm-shorts-lockup-view-model-v2", ""))).toBe(
      true
    )
    expect(
      extractIsShort(
        make("ytd-video-renderer", '<a id="thumbnail" href="/shorts/s_1"></a>')
      )
    ).toBe(true)
    expect(extractIsShort(make("ytd-rich-item-renderer", POLYMER))).toBe(false)
  })
})
