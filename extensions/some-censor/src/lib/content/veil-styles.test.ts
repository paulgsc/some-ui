/**
 * The overflow half of #973, asserted as properties of the class table.
 *
 * The reported symptom was metadata running out of a small upcoming-slider
 * card. The causes were structural rather than cosmetic — a `min-width` wider
 * than the card, an unclamped title, and a fixed type scale — and each has a
 * corresponding property here. These are cheap string assertions, not layout
 * tests; what they buy is that removing the guard is a visible red diff rather
 * than something that only shows up in a screenshot of a narrow shelf.
 *
 * The complementary check that the utilities actually *exist* is the build: the
 * UnoCSS step scans this exact module, so a typo yields no rule at all.
 */

import { describe, expect, it } from "vitest"

import {
  hintClass,
  META,
  META_CHANNEL,
  META_SUB,
  railClass,
  TITLE,
  TITLE_LANG,
  VEIL,
} from "./veil-styles"

/** Every box that can hold text, and the class list it is built with. */
const BOXES = {
  "veil (occluding)": VEIL.occluding,
  "veil (whitelisted)": VEIL.whitelisted,
  "veil (revealed)": VEIL.revealed,
  "meta chip (roomy)": META.roomy,
  "meta chip (compact)": META.compact,
  "meta channel": META_CHANNEL,
  "meta sub": META_SUB,
  "title chip": TITLE.plain,
  "title chip (translated)": TITLE.translated,
  "title lang badge": TITLE_LANG,
  "hint (idle)": hintClass("idle"),
  "hint (meta)": hintClass("meta"),
  "hint (title)": hintClass("title"),
  "hint (whitelist)": hintClass("whitelist"),
} as const

describe("nothing can paint outside its card", () => {
  it("never sets a minimum width", () => {
    // The direct cause of the reported overflow: the meta chip carried
    // `min-width: 180px`, which is wider than an entire slider tile, so the
    // chip could not shrink to the card and its text ran past the edge.
    for (const [name, classes] of Object.entries(BOXES)) {
      expect(classes, name).not.toMatch(/\bmin-w-(?!0\b)/)
    }
  })

  it("lets every flex child shrink", () => {
    // A flex child defaults to min-width:auto, which floors it at its content
    // width and re-creates the same overflow one level down.
    for (const name of ["meta chip (roomy)", "meta chip (compact)"] as const) {
      expect(BOXES[name], name).toContain("min-w-0")
    }
    for (const name of [
      "meta channel",
      "meta sub",
      "title lang badge",
    ] as const) {
      expect(BOXES[name], name).toContain("min-w-0")
    }
  })

  it("clips whatever still does not fit", () => {
    expect(VEIL.occluding).toContain("overflow-hidden")
    expect(META.roomy).toContain("overflow-hidden")
    expect(TITLE.plain).toContain("overflow-hidden")
  })

  it("truncates every single-line text node", () => {
    for (const name of [
      "meta channel",
      "meta sub",
      "title lang badge",
      "hint (idle)",
      "hint (meta)",
      "hint (title)",
      "hint (whitelist)",
    ] as const) {
      expect(BOXES[name], name).toContain("truncate")
    }
  })

  it("clamps the title, which is the one node that can be arbitrarily long", () => {
    for (const variant of [TITLE.plain, TITLE.translated]) {
      expect(variant).toContain("line-clamp-2")
      expect(variant).toContain("break-words")
    }
  })
})

describe("the card, not the viewport, decides the size", () => {
  it("makes the veil a container so its children can query the card", () => {
    for (const variant of Object.values(VEIL)) {
      expect(variant).toContain("@container/boyo")
    }
  })

  it("scales up from the narrow case rather than down from the wide one", () => {
    // Smallest-first is what makes the slider tile the *default*. If the scale
    // were written the other way round, a card that matched no breakpoint —
    // which is what a 170px tile does — would get the widest styling.
    const responsive = [
      META.roomy,
      META.compact,
      TITLE.plain,
      hintClass("idle"),
      hintClass("meta"),
    ]
    for (const classes of responsive) {
      expect(classes).toMatch(/@\[220px\]:/)
      expect(classes).toMatch(/@\[340px\]:/)
    }
  })

  it("renders reduced meta in a small card", () => {
    // The issue's own suggested remedy: in a tile too narrow for both lines,
    // show the channel and drop the duration · date row.
    expect(META_SUB).toContain("hidden")
    expect(META_SUB).toContain("@[220px]:block")
    expect(META_CHANNEL, "the channel is never dropped").not.toContain("hidden")
  })

  it("gives the title more lines as the card grows", () => {
    expect(TITLE.plain).toContain("line-clamp-2")
    expect(TITLE.plain).toContain("@[220px]:line-clamp-3")
    expect(TITLE.plain).toContain("@[340px]:line-clamp-4")
  })
})

describe("the namespace survives the migration", () => {
  it("keeps the identity class the event layer and e2e suite key off", () => {
    for (const variant of Object.values(VEIL)) {
      expect(variant.startsWith("boyo-veil ")).toBe(true)
    }
    expect(META.roomy).toContain("boyo-meta")
    expect(META_CHANNEL).toContain("boyo-meta-channel")
    expect(META_SUB).toContain("boyo-meta-sub")
    expect(TITLE.plain).toContain("boyo-title-chip")
    expect(hintClass("idle")).toContain("boyo-hint")
    expect(railClass(0)).toContain("boyo-rail")
  })

  it("prefixes every class it authors", () => {
    // Charter §4. Utility classes are the shared vocabulary and are exempt;
    // anything that looks like a component name must carry the prefix.
    const componentish = /^[a-z][a-z-]*$/
    const utilities = new Set([
      "group",
      "absolute",
      "relative",
      "flex",
      "block",
      "hidden",
      "truncate",
      "uppercase",
      "transition",
      "b",
      "b-solid",
      "outline",
    ])
    for (const [name, classes] of Object.entries(BOXES)) {
      for (const token of classes.split(/\s+/)) {
        if (!componentish.test(token) || utilities.has(token)) continue
        // Remaining bare words are hyphenated utilities (`items-center`,
        // `line-clamp-2`) or ours. Ours are the ones that read as nouns.
        if (token.startsWith("boyo-")) continue
        expect(
          token.includes("-"),
          `${name}: "${token}" is neither a utility nor boyo-prefixed`
        ).toBe(true)
      }
    }
  })
})

describe("the progress rail", () => {
  it("advances monotonically and ends full", () => {
    expect(railClass(0)).toContain("w-0")
    expect(railClass(1)).toContain("w-1/2")
    expect(railClass(2)).toContain("w-full")
  })

  it("stays out of the way of clicks", () => {
    expect(railClass(1)).toContain("pointer-events-none")
  })
})

describe("the whitelisted veil stops being an occluder", () => {
  it("drops the heavy glass and stops taking clicks", () => {
    expect(VEIL.whitelisted).toContain("pointer-events-none")
    expect(VEIL.whitelisted).not.toContain("backdrop-blur-20px")
    expect(VEIL.occluding).toContain("backdrop-blur-20px")
  })
})
