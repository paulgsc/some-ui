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
  classifyCard,
  detectOccluderEngine,
  isVideoCard,
  occludedElements,
  PREMASK_FALLBACK_SELECTORS,
  PREMASK_SELECTORS,
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
 * Every pre-mask occluder rule, one entry per selector — identified by the
 * declaration only those rules carry, so renaming or reordering the rest of
 * the stylesheet cannot make this test silently stop looking at anything.
 *
 * #1390/QC0 requires each selector to own its own `{ }` block rather than
 * share one comma-separated list, so this walks every occurrence of the
 * marker declaration instead of assuming there is exactly one.
 */
/**
 * The `:has()`-free fallback block (#1504's own review): everything inside
 * `@supports not selector(:has(a)) { … }` is a rule only an engine without
 * `:has()` ever applies, so it is parsed separately from the main list.
 */
const FALLBACK_OPEN = "@supports not selector(:has(a)) {"

function splitFallback(): { main: string; fallback: string } {
  const start = CSS.indexOf(FALLBACK_OPEN)
  expect(
    start,
    "the Firefox 112–120 fallback block must exist"
  ).toBeGreaterThan(-1)
  // The block's own rules close with an indented `}`; the block itself is
  // the first `}` at column 0 after it opens.
  const end = CSS.indexOf("\n}", start)
  expect(end).toBeGreaterThan(start)
  const fallback = CSS.slice(start + FALLBACK_OPEN.length, end)
  const main = CSS.slice(0, start) + CSS.slice(end + 2)
  return { main, fallback }
}

function premaskRulesIn(css: string): Array<string> {
  const marker = "filter: brightness(0.35)"
  const rules: Array<string> = []
  let searchFrom = 0
  for (;;) {
    const declIndex = css.indexOf(marker, searchFrom)
    if (declIndex === -1) break
    const braceIndex = css.lastIndexOf("{", declIndex)
    const blockEnd = css.lastIndexOf("}", braceIndex)
    const commentEnd = css.lastIndexOf("*/", braceIndex)
    const selectorStart = blockEnd > commentEnd ? blockEnd + 1 : commentEnd + 2
    rules.push(css.slice(selectorStart, braceIndex).trim())
    searchFrom = declIndex + marker.length
  }
  return rules
}

function premaskRulesFromCss(): Array<string> {
  const rules = premaskRulesIn(splitFallback().main)
  expect(rules.length, "at least one occluder rule must exist").toBeGreaterThan(
    0
  )
  return rules
}

function fallbackRulesFromCss(): Array<string> {
  return premaskRulesIn(splitFallback().fallback)
}

/**
 * Commas outside any parentheses — a rule genuinely covering more than one
 * selector, as opposed to the comma inside a `:has(a, b)` argument list.
 */
function topLevelCommaCount(selector: string): number {
  let depth = 0
  let count = 0
  for (const ch of selector) {
    if (ch === "(") depth += 1
    else if (ch === ")") depth -= 1
    else if (ch === "," && depth === 0) count += 1
  }
  return count
}

describe("the stylesheet and the catalogue agree", () => {
  it("occludes exactly the tags the content script adopts, one rule per tag", () => {
    expect(premaskRulesFromCss().map(normalize)).toEqual(
      PREMASK_SELECTORS.map(normalize)
    )
  })

  it("keeps a :has()-free fallback for exactly the tags that declare one", () => {
    // Firefox 112–120 cannot parse `:has()`, and a rule it cannot parse is
    // dropped whole. The home feed's primary cell used to be occluded
    // unconditionally; #1422 moved it behind the guard, so on those engines
    // it needs the unconditional rule back (bot-found on #1504's own review).
    expect(fallbackRulesFromCss().map(normalize)).toEqual(
      PREMASK_FALLBACK_SELECTORS.map(normalize)
    )
    expect(PREMASK_FALLBACK_SELECTORS).toEqual([
      "ytd-rich-item-renderer:not([data-boyo])",
    ])
    for (const rule of fallbackRulesFromCss()) {
      expect(rule, "a fallback rule must not itself need :has()").not.toContain(
        ":has("
      )
    }
  })

  it("never shares one rule's declarations across more than one selector", () => {
    // The regression #1390/QC0 fixes: CSS selector-list invalidation is
    // all-or-nothing, so one unparseable selector sharing a rule with others
    // (e.g. `:has()` on a Firefox version that predates 121) used to cost
    // every other selector in that same rule its occluder too. This fails
    // against the old single comma-list form, where all eleven selectors
    // shared one rule.
    for (const rule of premaskRulesFromCss()) {
      expect(topLevelCommaCount(rule), rule).toBe(0)
    }
  })

  it("keeps the plain Polymer tags free of :has(), so the Firefox 112 floor — which predates :has() entirely — still occludes them", () => {
    const rule = premaskRulesFromCss().find((r) =>
      r.startsWith("ytd-video-renderer:")
    )
    expect(rule).toBeDefined()
    expect(rule).not.toContain(":has(")
  })

  it("guards every polymorphic tag with :has(), and no others", () => {
    for (const { tag, requiresVideoLink } of CARD_SELECTORS) {
      const rule = premaskRulesFromCss().find((r) => r.startsWith(`${tag}:`))
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

  it("does not occlude a cell or shelf that merely contains cards", () => {
    // Bot-found on #1504's own review: a wrapper necessarily contains its
    // children's watch links, so a link check alone would occlude it — and
    // adopt it as one card with one veil over everything inside. The inner
    // cards are the cards; the stylesheet and classifyCard() both exclude
    // the wrapper, so they agree about which element gets the veil.
    const cell = document.createElement("ytd-rich-item-renderer")
    cell.innerHTML = `<yt-lockup-view-model><a href="/watch?v=inner_1">t</a></yt-lockup-view-model>`
    document.body.appendChild(cell)
    const inner = cell.firstElementChild
    if (!(inner instanceof HTMLElement)) throw new Error("fixture")

    expect(classifyCard(cell)).toBe("container")
    expect(isVideoCard(cell)).toBe(false)
    expect(classifyCard(inner)).toBe("card")

    const occluded = occludedElements(document)
    expect(occluded, "the wrapper is not occluded").not.toContain(cell)
    expect(occluded, "the card inside is").toContain(inner)

    const shelf = document.createElement("ytd-rich-item-renderer")
    shelf.innerHTML = [1, 2, 3]
      .map(
        (n) =>
          `<ytm-shorts-lockup-view-model-v2><a href="/shorts/s${n}"></a></ytm-shorts-lockup-view-model-v2>`
      )
      .join("")
    document.body.appendChild(shelf)
    expect(classifyCard(shelf), "a shelf of shorts is not one short").toBe(
      "container"
    )
    expect(occludedElements(document)).not.toContain(shelf)
    expect(
      occludedElements(document).filter((el) => shelf.contains(el)),
      "each short inside is"
    ).toHaveLength(3)
    cell.remove()
    shelf.remove()
  })

  it("counts what the fallback rule occludes on an engine without :has()", () => {
    // Bot-found on #1504's own review: on Firefox 112–120 the guarded rules
    // are dropped and the fallback block occludes *every* unstamped
    // rich-item — shells and containers included. A census that only knew
    // the guarded condition would call such a page clean while an ad cell
    // sat blurred and inert on it.
    const ad = document.createElement("ytd-rich-item-renderer")
    ad.innerHTML = "<ytd-ad-slot-renderer></ytd-ad-slot-renderer>"
    const wrapper = document.createElement("ytd-rich-item-renderer")
    wrapper.innerHTML = `<yt-lockup-view-model><a href="/watch?v=w1">t</a></yt-lockup-view-model>`
    const channel = document.createElement("yt-lockup-view-model")
    channel.innerHTML = '<a href="/@c">c</a>'
    const plain = document.createElement("ytd-video-renderer")
    document.body.append(ad, wrapper, channel, plain)

    const modern = occludedElements(document, { hasSelector: true })
    expect(modern).not.toContain(ad)
    expect(modern).not.toContain(wrapper)
    expect(modern).not.toContain(channel)
    expect(modern).toContain(plain)

    const fallback = occludedElements(document, { hasSelector: false })
    expect(fallback, "the ad cell is blurred there").toContain(ad)
    expect(fallback, "and so is the wrapper").toContain(wrapper)
    expect(
      fallback,
      "a lockup has no fallback rule, so it is simply unmasked there"
    ).not.toContain(channel)
    expect(fallback).toContain(plain)

    expect(
      detectOccluderEngine(document).hasSelector,
      "jsdom parses :has()"
    ).toBe(true)
    ad.remove()
    wrapper.remove()
    channel.remove()
    plain.remove()
  })
})

describe("isVideoCard", () => {
  it("accepts an unguarded renderer on its tag alone", () => {
    const el = document.createElement("ytd-video-renderer")
    expect(isVideoCard(el)).toBe(true)
  })

  it("rejects a rich-item cell that wraps something other than a video (#1422)", () => {
    // The home feed's grid cell is polymorphic in exactly the way a lockup is:
    // an ad slot, a Shorts shelf or a post renders under the same tag with no
    // watch href anywhere. Accepting it on the tag alone was the whole of
    // [ORP1] — occluded by the stylesheet, never resolvable, never released.
    const ad = document.createElement("ytd-rich-item-renderer")
    ad.innerHTML =
      "<ytd-ad-slot-renderer><div>sponsored</div></ytd-ad-slot-renderer>"
    expect(isVideoCard(ad)).toBe(false)

    const video = document.createElement("ytd-rich-item-renderer")
    video.innerHTML = '<a id="video-title" href="/watch?v=abc123">t</a>'
    expect(isVideoCard(video)).toBe(true)
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
