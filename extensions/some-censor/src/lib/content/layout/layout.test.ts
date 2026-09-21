/**
 * The layout table (BC1, #1434): the checked-in artifact is what the crawl
 * would produce today, the instrument is deterministic, and the lookups
 * answer the questions the Sensor asks.
 *
 * The fixtures are parsed with `DOMParser` under jsdom rather than loaded in
 * a browser — the instrument is the same closure-free function the crawler
 * hands to Playwright, so this is the same measurement in a second harness.
 */

import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { VIDEO_SELECTORS } from "@censor/lib/content/selectors"
import { describe, expect, it } from "vitest"

import { fingerprintInput, FIXTURE_TARGETS } from "./crawl-input"
import { fingerprintSurface, mergeLayouts } from "./fingerprint"
import { YOUTUBE_LAYOUT } from "./generated/youtube-layout"
import {
  classifyShape,
  declaredOuters,
  resolveSurface,
  tableStatus,
} from "./lookup"
import { isLayoutTable, LAYOUT_SCHEMA_VERSION } from "./schema"
import type { LayoutTable, SurfaceLayout } from "./schema"
import { surfaceOf } from "./surface"

const FIXTURE_DIR = resolve(process.cwd(), "tests/e2e/fixtures")

function fixtureDocument(file: string): Document {
  const html = readFileSync(resolve(FIXTURE_DIR, file), "utf8")
  return new DOMParser().parseFromString(html, "text/html")
}

/** The table the crawler would write from the fixtures, minus the timestamp. */
function crawlFixtures(): Omit<LayoutTable, "generatedAt"> {
  const surfaces: Record<string, SurfaceLayout> = {}
  const all: Array<SurfaceLayout> = []
  for (const target of FIXTURE_TARGETS) {
    const layout = fingerprintSurface(
      fixtureDocument(target.load),
      fingerprintInput(target.surface, target.path)
    )
    const merged = mergeLayouts(target.surface, [layout])
    surfaces[target.surface] = merged
    all.push(merged)
  }
  surfaces["*"] = mergeLayouts("*", all)
  return {
    schemaVersion: LAYOUT_SCHEMA_VERSION,
    source: "fixtures",
    generator: "pnpm layout:crawl",
    surfaces,
  }
}

// Widened from the generated `as const` literal so comparisons against it are
// ordinary string comparisons rather than literal-type tautologies.
const CHECKED_IN: LayoutTable = YOUTUBE_LAYOUT

describe("the checked-in table", () => {
  it("is a well-formed table at the current schema version", () => {
    expect(isLayoutTable(YOUTUBE_LAYOUT)).toBe(true)
    expect(tableStatus(YOUTUBE_LAYOUT)).toEqual({ kind: "current" })
  })

  it("is exactly what a crawl of the fixtures produces today", () => {
    // The in-sync check: a fixture edit that changes a shape must land with a
    // regenerated table, and a hand edit to the table shows up here as a diff
    // against what the instrument actually measures.
    const { generatedAt: _ignored, ...checkedIn } = CHECKED_IN
    expect(checkedIn).toEqual(crawlFixtures())
  })

  it("records the nesting #1426 is about", () => {
    const home = CHECKED_IN.surfaces.home
    expect(home).toBeDefined()
    expect(
      home?.shapes.some(
        (s) =>
          s.tag === "yt-lockup-view-model" &&
          s.role === "nested" &&
          s.outer === "ytd-rich-item-renderer"
      )
    ).toBe(true)
  })

  it("carries no query string in any path", () => {
    for (const layout of Object.values(CHECKED_IN.surfaces)) {
      for (const path of layout.paths) expect(path).not.toContain("?")
    }
  })
})

describe("the instrument", () => {
  it("is deterministic: two measurements of one document agree byte for byte", () => {
    const doc = fixtureDocument("yt-home.html")
    const input = fingerprintInput("home", "/")
    const a = JSON.stringify(fingerprintSurface(doc, input))
    const b = JSON.stringify(fingerprintSurface(doc, input))
    expect(a).toBe(b)
  })

  it("closes over nothing, so it survives Function.prototype.toString", () => {
    // What lets the crawler hand it to page.evaluate(): the source must be a
    // complete program on its own. Re-materialize it and run the copy.
    const doc = fixtureDocument("yt-watch.html")
    const input = fingerprintInput("watch", "/watch")
    // eslint-disable-next-line no-new-func, @typescript-eslint/consistent-type-assertions
    const copy = new Function(
      `return (${fingerprintSurface.toString()})`
    )() as typeof fingerprintSurface
    expect(copy(doc, input)).toEqual(fingerprintSurface(doc, input))
  })

  it("folds occurrences by (tag, role, outer) and sorts them", () => {
    const doc = new DOMParser().parseFromString(
      `<ytd-rich-item-renderer><yt-lockup-view-model><a href="/watch?v=a"></a></yt-lockup-view-model></ytd-rich-item-renderer>
       <yt-lockup-view-model><a href="/watch?v=b"></a></yt-lockup-view-model>
       <ytd-rich-item-renderer><a id="video-title" href="/watch?v=c">t</a></ytd-rich-item-renderer>`,
      "text/html"
    )
    const layout = fingerprintSurface(doc, fingerprintInput("home", "/"))
    expect(layout.shapes.map((s) => [s.tag, s.role, s.outer, s.count])).toEqual(
      [
        ["yt-lockup-view-model", "anchor", null, 1],
        ["yt-lockup-view-model", "nested", "ytd-rich-item-renderer", 1],
        ["ytd-rich-item-renderer", "anchor", null, 2],
      ]
    )
    const outer = layout.shapes.find((s) => s.tag === "ytd-rich-item-renderer")
    expect(outer?.withVideoLink, "both cells contain a watch href").toBe(2)
    expect(
      outer?.fields.title,
      "only the Polymer one has a title node"
    ).toEqual([0, 1])
  })

  it("merges layouts by adding counts and unioning matched selectors", () => {
    const a = fingerprintSurface(
      fixtureDocument("yt-home.html"),
      fingerprintInput("home", "/")
    )
    const merged = mergeLayouts("home", [a, a])
    for (const shape of merged.shapes) {
      const single = a.shapes.find(
        (s) =>
          s.tag === shape.tag &&
          s.role === shape.role &&
          s.outer === shape.outer
      )
      expect(shape.count).toBe((single?.count ?? 0) * 2)
      expect(shape.fields).toEqual(single?.fields)
    }
    expect(merged.paths).toEqual(["/"])
  })
})

describe("classifyShape", () => {
  const table = CHECKED_IN
  const classify = (
    surface: Parameters<typeof classifyShape>[2],
    tag: string,
    outer: string | null
  ): ReturnType<typeof classifyShape> =>
    classifyShape(table, VIDEO_SELECTORS, surface, tag, outer)

  it("answers anchor, nested, or not-card from the table alone", () => {
    expect(classify("home", "ytd-rich-item-renderer", null)).toEqual({
      kind: "anchor",
    })
    expect(
      classify("home", "yt-lockup-view-model", "ytd-rich-item-renderer")
    ).toEqual({ kind: "nested", outer: "ytd-rich-item-renderer" })
    expect(classify("home", "yt-lockup-view-model", null)).toEqual({
      kind: "anchor",
    })
    expect(classify("home", "div", null)).toEqual({ kind: "not-card" })
    expect(classify("home", "ytd-ad-slot-renderer", null)).toEqual({
      kind: "not-card",
    })
  })

  it("says unknown, with a reason, rather than guessing", () => {
    // A catalogue tag the crawl never saw on this surface.
    expect(classify("watch", "yt-lockup-view-model", null)).toEqual({
      kind: "unknown",
      reason: "tag-unseen",
    })
    // Seen on the surface, but never inside this outer tag.
    expect(
      classify("home", "yt-lockup-view-model", "ytd-compact-video-renderer")
    ).toEqual({ kind: "unknown", reason: "unexpected-outer" })
    // Seen only nested on a surface with no anchor occurrence at all.
    const nestedOnly: LayoutTable = {
      ...table,
      surfaces: {
        home: {
          surface: "home",
          paths: ["/"],
          shapes: (table.surfaces.home?.shapes ?? []).filter(
            (s) => s.tag !== "yt-lockup-view-model" || s.role === "nested"
          ),
        },
      },
    }
    expect(
      classifyShape(
        nestedOnly,
        VIDEO_SELECTORS,
        "home",
        "yt-lockup-view-model",
        null
      )
    ).toEqual({ kind: "unknown", reason: "nested-without-outer" })
  })

  it("falls back to the union for a surface the crawl never visited", () => {
    // Search is not in the fixture crawl; the union still knows the shapes.
    expect(resolveSurface(table, "search").kind).toBe("fallback")
    expect(classify("search", "ytd-compact-video-renderer", null)).toEqual({
      kind: "anchor",
    })
  })

  it("reports an uncrawled surface when there is no union either", () => {
    const empty: LayoutTable = { ...table, surfaces: {} }
    expect(resolveSurface(empty, "home")).toEqual({ kind: "none" })
    expect(
      classifyShape(
        empty,
        VIDEO_SELECTORS,
        "home",
        "ytd-rich-item-renderer",
        null
      )
    ).toEqual({ kind: "unknown", reason: "surface-uncrawled" })
  })

  it("names the outer tags a Sensor should confirm with closest()", () => {
    expect(declaredOuters(table, "home", "yt-lockup-view-model")).toEqual([
      "ytd-rich-item-renderer",
    ])
    expect(declaredOuters(table, "home", "ytd-rich-item-renderer")).toEqual([])
  })
})

describe("the schema", () => {
  it("distinguishes a schema this reader predates from a stale table", () => {
    const future: LayoutTable = {
      ...CHECKED_IN,
      schemaVersion: LAYOUT_SCHEMA_VERSION + 1,
    }
    expect(isLayoutTable(future), "still well-formed").toBe(true)
    expect(tableStatus(future)).toEqual({
      kind: "unknown-schema",
      found: LAYOUT_SCHEMA_VERSION + 1,
      expected: LAYOUT_SCHEMA_VERSION,
    })
  })

  it("rejects a malformed table", () => {
    expect(isLayoutTable(null)).toBe(false)
    expect(isLayoutTable({ schemaVersion: 1 })).toBe(false)
    expect(
      isLayoutTable({
        ...CHECKED_IN,
        surfaces: {
          home: { ...CHECKED_IN.surfaces.home, surface: "watch" },
        },
      }),
      "a surface keyed under the wrong name"
    ).toBe(false)
    expect(
      isLayoutTable({
        ...CHECKED_IN,
        surfaces: {
          home: {
            ...CHECKED_IN.surfaces.home,
            shapes: [{ tag: "x", role: "sideways", outer: null }],
          },
        },
      }),
      "an unknown role"
    ).toBe(false)
  })
})

describe("surfaceOf", () => {
  it("classifies every path the crawl targets", () => {
    for (const target of FIXTURE_TARGETS) {
      expect(surfaceOf(target.path)).toBe(target.surface)
    }
    expect(surfaceOf("/results")).toBe("search")
    expect(surfaceOf("/shorts/abc")).toBe("shorts")
    expect(surfaceOf("/@Someone")).toBe("channel")
    expect(surfaceOf("/feed/subscriptions")).toBe("subscriptions")
    expect(surfaceOf("/feed/history")).toBe("other")
  })
})
