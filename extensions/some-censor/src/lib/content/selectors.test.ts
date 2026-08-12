/**
 * The card catalogue, and the one thing that can silently break it.
 *
 * #973 was two bugs with one shape: the set of elements the *stylesheet*
 * occludes and the set the *content script* adopts were maintained by hand, in
 * two files, and drifted. A tag in the CSS but not in TypeScript is a card
 * blurred forever with no veil coming; a tag in TypeScript but not in the CSS
 * is a card that flashes its thumbnail before the veil mounts. Neither shows up
 * in a type error and neither shows up in the e2e fixtures, which only contain
 * the tags someone remembered to add.
 *
 * So the sync is asserted here instead.
 */

import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import {
  CARD_SELECTORS,
  isVideoCard,
  PREMASK_SELECTOR,
  SEL,
  VIDEO_SELECTORS,
} from "./selectors"

// Read from disk rather than imported: vitest resolves a `.css` import to an
// empty module by design, and the point of this suite is the actual bytes the
// build will concatenate into dist/styles/content.css.
const CSS_PATH = resolve(process.cwd(), "src/styles/content.css")
const CSS = readFileSync(CSS_PATH, "utf8")

/** Whitespace is prettier's to decide; the selector set is ours. */
function normalize(selector: string): string {
  return selector.replace(/\s+/g, "")
}

/**
 * The selector list attached to the pre-mask occluder — identified by the
 * declaration only that rule carries, so renaming or reordering the rest of the
 * stylesheet cannot make this test silently stop looking at anything.
 */
function premaskSelectorFromCss(): string {
  const marker = "filter: brightness(0.35)"
  const declIndex = CSS.indexOf(marker)
  expect(declIndex, `the occluder rule (${marker}) must exist`).toBeGreaterThan(
    -1
  )

  const braceIndex = CSS.lastIndexOf("{", declIndex)
  const commentEnd = CSS.lastIndexOf("*/", braceIndex)
  return CSS.slice(commentEnd + 2, braceIndex)
}

describe("the stylesheet and the catalogue agree", () => {
  it("occludes exactly the tags the content script adopts", () => {
    expect(normalize(premaskSelectorFromCss())).toBe(
      normalize(PREMASK_SELECTOR)
    )
  })

  it("guards every polymorphic tag with :has(), and no others", () => {
    for (const { tag, requiresVideoLink } of CARD_SELECTORS) {
      const rule = PREMASK_SELECTOR.split(",\n").find((r) =>
        r.startsWith(`${tag}:`)
      )
      expect(rule, `${tag} must appear in the pre-mask rule`).toBeDefined()
      expect(rule?.includes(":has("), `${tag} :has() guard`).toBe(
        requiresVideoLink
      )
    }
  })

  it("never occludes a card it cannot later un-occlude", () => {
    // The invariant behind the guard: the only thing that lifts the pre-mask
    // filter is the content script writing data-boyo, and it only does that for
    // an element isVideoCard() accepts. So anything the CSS occludes must be
    // something isVideoCard() could accept.
    const guarded = CARD_SELECTORS.filter((s) => s.requiresVideoLink)
    for (const { tag } of guarded) {
      const el = document.createElement(tag)
      expect(isVideoCard(el), `${tag} without a video link`).toBe(false)
      el.innerHTML = '<a href="/watch?v=abc123">t</a>'
      expect(isVideoCard(el), `${tag} with a watch link`).toBe(true)
    }
  })
})

describe("isVideoCard", () => {
  it("accepts an unguarded renderer on its tag alone", () => {
    const el = document.createElement("ytd-rich-item-renderer")
    expect(isVideoCard(el)).toBe(true)
  })

  it("rejects an element that is not in the catalogue at all", () => {
    const el = document.createElement("div")
    el.innerHTML = '<a href="/watch?v=abc123">t</a>'
    expect(isVideoCard(el)).toBe(false)
  })

  it("rejects the channel and playlist shapes of a lockup", () => {
    // The regression the guard exists for: these render with the same tag as a
    // video lockup and must not be adopted or occluded.
    const channel = document.createElement("yt-lockup-view-model")
    channel.innerHTML = '<a href="/@somechannel">Some Channel</a>'
    expect(isVideoCard(channel)).toBe(false)

    const playlist = document.createElement("yt-lockup-view-model")
    playlist.innerHTML = '<a href="/playlist?list=PL123">A playlist</a>'
    expect(isVideoCard(playlist)).toBe(false)
  })

  it("accepts a shorts lockup", () => {
    const el = document.createElement("ytm-shorts-lockup-view-model-v2")
    el.innerHTML = '<a href="/shorts/abc123">s</a>'
    expect(isVideoCard(el)).toBe(true)
  })

  it("is case-insensitive about the tag name", () => {
    // getElementsByTagName and friends can hand back uppercase tagNames.
    const el = document.createElement("YT-LOCKUP-VIEW-MODEL")
    el.innerHTML = '<a href="/watch?v=abc123">t</a>'
    expect(isVideoCard(el)).toBe(true)
  })
})

describe("the catalogue itself", () => {
  it("covers the card types #973 reported as never masked", () => {
    // Named explicitly so deleting one is a decision, not an omission.
    expect(VIDEO_SELECTORS).toEqual(
      expect.arrayContaining([
        "yt-lockup-view-model",
        "ytm-shorts-lockup-view-model",
        "ytm-shorts-lockup-view-model-v2",
        "ytd-playlist-video-renderer",
        "ytd-reel-item-renderer",
        "ytd-structured-description-video-lockup-renderer",
      ])
    )
  })

  it("keeps the tags the extension already masked", () => {
    expect(VIDEO_SELECTORS).toEqual(
      expect.arrayContaining([
        "ytd-video-renderer",
        "ytd-rich-item-renderer",
        "ytd-grid-video-renderer",
        "ytd-compact-video-renderer",
        "ytd-playlist-panel-video-renderer",
      ])
    )
  })

  it("lists no tag twice", () => {
    expect(new Set(VIDEO_SELECTORS).size).toBe(VIDEO_SELECTORS.length)
  })

  it("produces a SEL that matches every catalogued tag", () => {
    for (const tag of VIDEO_SELECTORS) {
      expect(document.createElement(tag).matches(SEL), tag).toBe(true)
    }
  })

  it("produces a SEL that is a superset of the guarded set", () => {
    // SEL is deliberately unguarded so `closest()` and `matches()` stay cheap;
    // the guard is isVideoCard's job. A channel lockup matching SEL is correct.
    const channel = document.createElement("yt-lockup-view-model")
    expect(channel.matches(SEL)).toBe(true)
    expect(isVideoCard(channel)).toBe(false)
  })
})
