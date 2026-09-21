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
import type { CardKind } from "@censor/lib/content/selectors"
import { describe, expect, it } from "vitest"

import { fingerprintInput, FIXTURE_TARGETS } from "./crawl-input"
import { fingerprintSurface, mergeLayouts } from "./fingerprint"
import { YOUTUBE_LAYOUT } from "./generated/youtube-layout"
import { classifyShape, resolveSurface, tableStatus } from "./lookup"
import type { ObservedNode } from "./lookup"
import { isLayoutTable, LAYOUT_SCHEMA_VERSION } from "./schema"
import type { LayoutTable, SurfaceLayout } from "./schema"
import { surfaceOf } from "./surface"
import { assembleTable } from "./table"

const FIXTURE_DIR = resolve(process.cwd(), "tests/e2e/fixtures")

function fixtureDocument(file: string): Document {
  const html = readFileSync(resolve(FIXTURE_DIR, file), "utf8")
  return new DOMParser().parseFromString(html, "text/html")
}

/** The table the crawler would write from the fixtures today. */
function crawlFixtures(generatedAt: string): LayoutTable {
  return assembleTable({
    source: "fixtures",
    generator: "pnpm layout:crawl",
    generatedAt,
    layouts: FIXTURE_TARGETS.map((target) =>
      fingerprintSurface(
        fixtureDocument(target.load),
        fingerprintInput(target.surface, target.path)
      )
    ),
  }).table
}

function crawledSurfaces(table: LayoutTable): ReadonlyArray<SurfaceLayout> {
  return Object.entries(table.surfaces)
    .filter(([key]) => key !== "*")
    .map(([, layout]) => layout)
}

/**
 * What "in sync" means depends on where the table came from.
 *
 * A fixture table is what a fixture crawl produces today, exactly: a fixture
 * edit that changes a shape must land with a regenerated table, and a hand
 * edit to the table shows up as a diff against what the instrument measures.
 *
 * A live table cannot be reproduced offline. For it the fixture crawl is the
 * instrument's determinism check (the "the instrument" suite below), and the
 * table itself must be internally consistent: written by the live
 * invocation, holding no surface the crawl saw nothing on (`assembleTable`
 * leaves those out so the union serves them), and with `"*"` the union of
 * exactly the surfaces it holds.
 */
function expectInSync(table: LayoutTable): void {
  if (table.source === "fixtures") {
    expect(table).toEqual(crawlFixtures(table.generatedAt))
    return
  }
  expect(table.generator).toContain("--live")
  const surfaces = crawledSurfaces(table)
  expect(surfaces.length).toBeGreaterThan(0)
  for (const layout of surfaces) {
    expect(layout.shapes.length, `${layout.surface} is empty`).toBeGreaterThan(
      0
    )
  }
  expect(table.surfaces["*"]).toEqual(mergeLayouts("*", surfaces))
}

// Widened from the generated `as const` literal so comparisons against it are
// ordinary string comparisons rather than literal-type tautologies.
const CHECKED_IN: LayoutTable = YOUTUBE_LAYOUT

describe("the checked-in table", () => {
  it("is a well-formed table at the current schema version", () => {
    expect(isLayoutTable(YOUTUBE_LAYOUT)).toBe(true)
    expect(tableStatus(YOUTUBE_LAYOUT)).toEqual({ kind: "current" })
  })

  it("is in sync with its source", () => {
    expectInSync(CHECKED_IN)
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

describe("assembleTable", () => {
  const home = fingerprintSurface(
    fixtureDocument("yt-home.html"),
    fingerprintInput("home", "/")
  )
  const watch = fingerprintSurface(
    fixtureDocument("yt-watch.html"),
    fingerprintInput("watch", "/watch")
  )
  const nothing: SurfaceLayout = {
    surface: "subscriptions",
    paths: ["/feed/subscriptions"],
    shapes: [],
  }

  it("leaves out a surface whose page showed no catalogue tag, so the union serves it", () => {
    // A signed-out /feed/subscriptions renders a sign-in prompt and no cards.
    // Recording that as "subscriptions has no shapes" would make every real
    // card there `tag-unseen`; leaving it out makes it `fallback`.
    const { table, skipped } = assembleTable({
      source: "live",
      generator: "pnpm layout:crawl -- --live",
      generatedAt: "2026-01-01T00:00:00.000Z",
      layouts: [home, nothing, watch],
    })
    expect(skipped).toEqual(["subscriptions"])
    expect(Object.keys(table.surfaces).sort()).toEqual(["*", "home", "watch"])
    expect(table.surfaces["*"]).toEqual(mergeLayouts("*", [home, watch]))
    expect(resolveSurface(table, "subscriptions").kind).toBe("fallback")
    expect(
      classifyShape(table, "subscriptions", {
        tag: "ytd-rich-item-renderer",
        card: "card",
        outer: null,
      })
    ).toEqual({ kind: "anchor" })
  })

  it("folds several pages of one surface and keys surfaces in sorted order", () => {
    const { table } = assembleTable({
      source: "fixtures",
      generator: "pnpm layout:crawl",
      generatedAt: "2026-01-01T00:00:00.000Z",
      layouts: [watch, home, home],
    })
    expect(Object.keys(table.surfaces)).toEqual(["home", "watch", "*"])
    expect(table.surfaces.home).toEqual(mergeLayouts("home", [home, home]))
    expect(isLayoutTable(table)).toBe(true)
  })

  it("produces a live table the in-sync check accepts", () => {
    // The README's workflow: `pnpm layout:crawl -- --live`, commit the table.
    // The suite must keep passing on the result even though no fixture
    // crawl can reproduce it.
    const { table } = assembleTable({
      source: "live",
      generator: "pnpm layout:crawl -- --live",
      generatedAt: "2026-01-01T00:00:00.000Z",
      layouts: [home, nothing, watch],
    })
    expectInSync(table)
    // …and refuses one that recorded an empty surface anyway.
    const withEmpty: LayoutTable = {
      ...table,
      surfaces: { ...table.surfaces, subscriptions: nothing },
    }
    expect(() => expectInSync(withEmpty)).toThrow(/subscriptions is empty/)
  })

  it("produces the fixture table the in-sync check compares against", () => {
    const { table, skipped } = assembleTable({
      source: "fixtures",
      generator: "pnpm layout:crawl",
      generatedAt: CHECKED_IN.generatedAt,
      layouts: [home, watch],
    })
    expect(skipped).toEqual([])
    expect(table).toEqual(CHECKED_IN)
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
    expect(outer?.withChildCard, "only one cell wraps another card").toBe(1)
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
    surface: Parameters<typeof classifyShape>[1],
    tag: string,
    outer: string | null,
    card: CardKind = "card"
  ): ReturnType<typeof classifyShape> =>
    classifyShape(table, surface, { tag, card, outer })

  it("answers anchor or nested for a card, from the table alone", () => {
    expect(classify("home", "ytd-rich-item-renderer", null)).toEqual({
      kind: "anchor",
    })
    expect(
      classify("home", "yt-lockup-view-model", "ytd-rich-item-renderer")
    ).toEqual({ kind: "nested", outer: "ytd-rich-item-renderer" })
    expect(classify("home", "yt-lockup-view-model", null)).toEqual({
      kind: "anchor",
    })
  })

  it("never says anchor without the card guard — a polymorphic tag's ad, shell or container occurrence is what classifyCard() said, whatever the table holds (#1505's own review)", () => {
    // The home fingerprint records rich items that are anchors by ancestry
    // and yet not cards; the table cannot tell them apart, so the verdict
    // comes in as an argument and the table is not consulted for it.
    const rich = table.surfaces.home?.shapes.find(
      (s) => s.tag === "ytd-rich-item-renderer" && s.role === "anchor"
    )
    expect(rich?.count).toBeGreaterThan(rich?.withVideoLink ?? 0)
    expect(rich?.withChildCard).toBeGreaterThan(0)

    expect(
      classify("home", "ytd-rich-item-renderer", null, "container")
    ).toEqual({ kind: "container" })
    expect(classify("home", "ytd-rich-item-renderer", null, "shell")).toEqual({
      kind: "shell",
    })
    expect(classify("home", "div", null, "none")).toEqual({ kind: "not-card" })
    expect(classify("home", "ytd-ad-slot-renderer", null, "none")).toEqual({
      kind: "not-card",
    })
  })

  it("says unknown, with a reason, rather than guessing", () => {
    // A catalogue tag the crawl never saw on this surface.
    expect(classify("watch", "yt-lockup-view-model", null)).toEqual({
      kind: "unknown",
      reason: "tag-unseen",
    })
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
      classifyShape(nestedOnly, "home", {
        tag: "yt-lockup-view-model",
        card: "card",
        outer: null,
      })
    ).toEqual({ kind: "unknown", reason: "nested-without-outer" })
  })

  it("reports a parent the crawl never declared as unexpected-outer — which is why the Sensor must confirm the outer against the whole catalogue, not the table's declared parents (#1505's own review)", () => {
    // yt-lockup-view-model has an anchor shape on home. Had the Sensor asked
    // closest() only for the parents the table declares, a new parent would
    // have come back null and this node would have passed as that anchor.
    const node: ObservedNode = {
      tag: "yt-lockup-view-model",
      card: "card",
      outer: "ytd-compact-video-renderer",
    }
    expect(classifyShape(table, "home", node)).toEqual({
      kind: "unknown",
      reason: "unexpected-outer",
    })
    expect(classifyShape(table, "home", { ...node, outer: null })).toEqual({
      kind: "anchor",
    })
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
      classifyShape(empty, "home", {
        tag: "ytd-rich-item-renderer",
        card: "card",
        outer: null,
      })
    ).toEqual({ kind: "unknown", reason: "surface-uncrawled" })
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
