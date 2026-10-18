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
  readWatch,
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

// The watch rail, the Mix lockup and the playlist-panel row, cut down from a
// signed-in watch page in a Mix captured 2026-10-17 (#1848), with
// placeholders for every title, channel and id.
const RAIL_LOCKUP = `
  <div class="ytLockupViewModelHost ytLockupViewModelHorizontal content-id-rail_1">
    <a class="ytLockupViewModelContentImage" href="/watch?v=rail_1&amp;list=RDmix_1&amp;start_radio=1">
      <yt-thumbnail-view-model class="ytThumbnailViewModelHost">
        <yt-thumbnail-bottom-overlay-view-model class="ytThumbnailBottomOverlayViewModelHost">
          <yt-thumbnail-badge-view-model class="ytThumbnailBadgeViewModelHost ytThumbnailBottomOverlayViewModelBadge">
            <badge-shape class="ytBadgeShapeHost" role="img" aria-label="3 minutes, 11 seconds">
              <div class="ytBadgeShapeText" aria-hidden="true">3:11</div>
            </badge-shape>
          </yt-thumbnail-badge-view-model>
        </yt-thumbnail-bottom-overlay-view-model>
      </yt-thumbnail-view-model>
    </a>
    <yt-lockup-metadata-view-model class="ytLockupMetadataViewModelHost ytLockupMetadataViewModelTitleMaxLines3">
      <div class="ytLockupMetadataViewModelAvatar">
        <div class="ytSpecAvatarShapeHost" role="button" aria-label="Go to channel Rail Channel"></div>
      </div>
      <div class="ytLockupMetadataViewModelTextContainer">
        <h3 class="ytLockupMetadataViewModelHeadingReset" title="Rail Title">
          <a class="ytLockupMetadataViewModelTitle" href="/watch?v=rail_1&amp;list=RDmix_1&amp;start_radio=1">
            <span class="ytAttributedStringHost" role="text">Rail Title</span>
          </a>
        </h3>
        <yt-content-metadata-view-model class="ytContentMetadataViewModelHost">
          <div class="ytContentMetadataViewModelMetadataRow" role="group">
            <span class="ytAttributedStringHost ytContentMetadataViewModelMetadataText ytContentMetadataViewModelMetadataTextLastPart" role="text">Rail Channel</span>
          </div>
          <div class="ytContentMetadataViewModelMetadataRow" role="group">
            <span class="ytIconWrapperHost ytContentMetadataViewModelLeadingIcon"></span>
            <span class="ytAttributedStringHost ytContentMetadataViewModelMetadataText" aria-label="50 thousand views" role="text">50K</span>
            <span class="ytContentMetadataViewModelDelimiter" aria-hidden="true"></span>
            <span class="ytAttributedStringHost ytContentMetadataViewModelMetadataText ytContentMetadataViewModelMetadataTextLastPart" aria-label="14 years ago" role="text">14y ago</span>
          </div>
        </yt-content-metadata-view-model>
      </div>
    </yt-lockup-metadata-view-model>
  </div>`

const MIX_LOCKUP = `
  <div class="ytLockupViewModelHost ytLockupViewModelCollectionStack2 content-id-RDmix_2">
    <a class="ytLockupViewModelContentImage" href="/watch?v=mix_2&amp;list=RDmix_2&amp;start_radio=1">
      <yt-collection-thumbnail-view-model class="ytCollectionThumbnailViewModelHost">
        <yt-collections-stack class="ytCollectionsStackHost">
          <yt-thumbnail-view-model class="ytThumbnailViewModelHost">
            <yt-thumbnail-overlay-badge-view-model class="ytThumbnailOverlayBadgeViewModelHost ytThumbnailOverlayBadgeViewModelBottomEnd">
              <yt-thumbnail-badge-view-model class="ytThumbnailBadgeViewModelHost ytThumbnailOverlayBadgeViewModelBadge">
                <badge-shape class="ytBadgeShapeHost">
                  <div class="ytBadgeShapeIcon"></div>
                  <div class="ytBadgeShapeText">Mix</div>
                </badge-shape>
              </yt-thumbnail-badge-view-model>
            </yt-thumbnail-overlay-badge-view-model>
          </yt-thumbnail-view-model>
        </yt-collections-stack>
      </yt-collection-thumbnail-view-model>
    </a>
    <yt-lockup-metadata-view-model class="ytLockupMetadataViewModelHost">
      <h3 class="ytLockupMetadataViewModelHeadingReset" title="Mix Title">
        <a class="ytLockupMetadataViewModelTitle" href="/watch?v=mix_2&amp;list=RDmix_2&amp;start_radio=1">
          <span class="ytAttributedStringHost" role="text">Mix Title</span>
        </a>
      </h3>
      <yt-content-metadata-view-model class="ytContentMetadataViewModelHost">
        <div class="ytContentMetadataViewModelMetadataRow" role="group">
          <span class="ytAttributedStringHost ytContentMetadataViewModelMetadataText" role="text">Artist A, Artist B and more</span>
          <span class="ytContentMetadataViewModelDelimiter" aria-hidden="true"></span>
          <span class="ytAttributedStringHost ytContentMetadataViewModelMetadataText ytContentMetadataViewModelMetadataTextLastPart" role="text">Playlist</span>
        </div>
      </yt-content-metadata-view-model>
    </yt-lockup-metadata-view-model>
  </div>`

const PANEL_ROW = `
  <a id="wc-endpoint" class="yt-simple-endpoint" href="/watch?v=panel_1&amp;list=RDmix_1&amp;index=2">
    <div id="container">
      <ytd-thumbnail>
        <a id="thumbnail" href="/watch?v=panel_1&amp;list=RDmix_1&amp;index=2"></a>
      </ytd-thumbnail>
      <div id="meta">
        <h4><span id="video-title" title="Panel Title">Panel Title</span></h4>
        <div id="byline-container">
          <span id="byline" title="Panel Channel">Panel Channel</span>
        </div>
      </div>
    </div>
  </a>`

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

  it("resolves a watch-rail lockup and a playlist-panel row by the channel's name, which is all they carry (#1848)", () => {
    expect(tryExtract(make("yt-lockup-view-model", RAIL_LOCKUP))).toEqual({
      kind: "full",
      videoId: "rail_1",
      channelId: "Rail Channel",
    })
    expect(
      tryExtract(make("ytd-playlist-panel-video-renderer", PANEL_ROW))
    ).toEqual({ kind: "full", videoId: "panel_1", channelId: "Panel Channel" })
  })

  it("takes no channel id from a link whose href names none", () => {
    // A channel link not hydrated yet waits for its href, the backfill's job,
    // and a link elsewhere in a collection's row is not a channel at all.
    const pending = make(
      "yt-lockup-view-model",
      CAMEL_LOCKUP.replace(
        '<a class="ytAttributedStringLink" href="/@CamelChannel">',
        '<a class="ytAttributedStringLink">'
      )
    )
    expect(tryExtract(pending).kind).toBe("video-only")
    expect(extractMeta(pending).channelName).toBe("Camel Channel")
    // Nor from a later unlabelled run, past the channel's.
    pending.insertAdjacentHTML(
      "beforeend",
      '<span class="ytContentMetadataViewModelMetadataText">Scheduled for 10/20/26</span>'
    )
    expect(tryExtract(pending).kind).toBe("video-only")
    const playlistLink = make(
      "yt-lockup-view-model",
      MIX_LOCKUP.replace(
        "Artist A, Artist B and more",
        '<a href="/playlist?list=PL1">View full playlist</a>'
      )
    )
    expect(tryExtract(playlistLink).channelId).toBeNull()
  })

  it("takes no channel from a Mix's artist list", () => {
    expect(tryExtract(make("yt-lockup-view-model", MIX_LOCKUP))).toEqual({
      kind: "video-only",
      videoId: "mix_2",
      channelId: null,
    })
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

  it("reads a watch-rail lockup's title by its class token", () => {
    // `h3 a` would also find it; the class token must, on its own.
    const rail = make("yt-lockup-view-model", RAIL_LOCKUP)
    rail
      .querySelector("h3")
      ?.replaceWith(...(rail.querySelector("h3")?.childNodes ?? []))
    expect(extractTitle(rail)).toBe("Rail Title")
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

  it("takes a search result's age from the last span of its line", () => {
    const result = make(
      "ytd-video-renderer",
      `<div id="metadata-line">
        <ytd-badge-supported-renderer class="inline-metadata-badge" hidden></ytd-badge-supported-renderer>
        <div id="separator" hidden>•</div>
        <span class="inline-metadata-item">23K</span>
        <span class="inline-metadata-item">8h ago</span>
        <dom-repeat></dom-repeat>
      </div>`
    )
    expect(extractUploadDate(result)).toBe("8h ago")
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

  it("reads a watch-rail lockup's duration from its bottom overlay", () => {
    expect(
      extractMeta(make("yt-lockup-view-model", RAIL_LOCKUP)).duration
    ).toBe("3:11")
  })

  it("does not read a Mix badge as a duration", () => {
    expect(
      extractMeta(make("yt-lockup-view-model", MIX_LOCKUP)).duration
    ).toBeNull()
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

describe("readWatch (#1805)", () => {
  function page(html: string): Document {
    const doc = document.implementation.createHTMLDocument("t")
    doc.body.innerHTML = `<ytd-app><ytd-page-manager>${html}</ytd-page-manager></ytd-app>`
    return doc
  }
  const metadata = (videoId: string): string => `
    <ytd-watch-metadata video-id="${videoId}">
      <ytd-watch-info-text>
        <yt-formatted-string id="info"><span>444M views</span><span> </span><span>21y ago</span><span> </span><a>SAN DIEGO ZOO</a></yt-formatted-string>
        <tp-yt-paper-tooltip><div id="tooltip"> 444,875,933 views • Apr 23, 2005 • SAN DIEGO ZOO </div></tp-yt-paper-tooltip>
      </ytd-watch-info-text>
    </ytd-watch-metadata>`

  it("reads the shown watch page's video and every run that may be its date", () => {
    const doc = page(
      `<ytd-browse hidden></ytd-browse><ytd-watch-flexy video-id="jNQ">${metadata("jNQ")}</ytd-watch-flexy>`
    )
    expect(readWatch(doc)).toEqual({
      videoId: "jNQ",
      short: false,
      hydrated: true,
      dates: [
        "444M views",
        "21y ago",
        "444,875,933 views",
        "Apr 23, 2005",
        "SAN DIEGO ZOO",
      ],
    })
  })

  it("reads no date while the metadata still names the previous video", () => {
    const doc = page(
      `<ytd-watch-flexy video-id="next">${metadata("jNQ")}</ytd-watch-flexy>`
    )
    expect(readWatch(doc)).toEqual({
      videoId: "next",
      short: false,
      hydrated: false,
      dates: [],
    })
  })

  it("reads a Short as a Short, and a hidden page as no page", () => {
    expect(readWatch(page("<ytd-shorts></ytd-shorts>"))?.short).toBe(true)
    expect(
      readWatch(
        page(
          `<ytd-watch-flexy hidden video-id="jNQ">${metadata("jNQ")}</ytd-watch-flexy><ytd-shorts hidden></ytd-shorts>`
        )
      )
    ).toBeNull()
  })
})
