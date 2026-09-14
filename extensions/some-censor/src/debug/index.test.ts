/**
 * The diagnostics page's pure surface.
 *
 * #1396 sets the testing bar at "whichever pattern some-filter's debug page
 * uses today, if any" — which is none. These cover the three functions that
 * are not DOM rendering, because they are what QC2 (#1384) actually consumes
 * out of an exported bundle: the corpus extraction, the export shape, and the
 * filename the story names. The rendering itself is left at the sibling's
 * bar rather than given a harness this story does not need.
 */

import { corpusOf, diagnosticsFilename, exportShape } from "@censor/debug/index"
import type {
  JsonValue,
  PersistedState,
} from "@some-extension/common/observability"
import { describe, expect, it, vi } from "vitest"

const NOW = 1_700_000_000_000

function bundle(snapshots: Record<string, JsonValue>): PersistedState {
  return {
    version: 1,
    namespace: "some-censor",
    events: [{ seq: 1, t: NOW, kind: "session.start", severity: "info" }],
    metrics: { counters: { sessions_started: 1 }, aggregates: {} },
    snapshots,
    dropped: 0,
    updatedAt: NOW,
  }
}

const HEALTH: JsonValue = {
  score: 100,
  status: "healthy",
  recentErrors: 0,
  generatedAt: NOW,
  invariants: [
    { name: "OccludedCardResolves", status: "ok", t: NOW, details: null },
  ],
}

describe("corpusOf — the date corpus #1384 consumes", () => {
  it("pulls every dates.<surface> snapshot, keyed by surface", () => {
    expect(
      corpusOf(
        bundle({
          "dates.home": ["3 days ago", "1 year ago"],
          "dates.watch": ["Streamed 2 hours ago"],
        })
      )
    ).toEqual([
      { surface: "home", forms: ["3 days ago", "1 year ago"] },
      { surface: "watch", forms: ["Streamed 2 hours ago"] },
    ])
  })

  it("sorts by surface, so two exports of the same browsing compare cleanly", () => {
    const corpus = corpusOf(
      bundle({
        "dates.watch": ["a"],
        "dates.home": ["b"],
        "dates.search": ["c"],
      })
    )
    expect(corpus.map((e) => e.surface)).toEqual(["home", "search", "watch"])
  })

  it("ignores snapshots that are not the corpus", () => {
    expect(
      corpusOf(bundle({ health: HEALTH, queues: { unresolved: 3 } }))
    ).toEqual([])
  })

  it("skips a corpus clamped to a string rather than showing it as forms — an older build could have exceeded maxDetailBytes, and a truncated string is not a corpus", () => {
    expect(
      corpusOf(
        bundle({
          "dates.home": '["3 days ago","1 ye…[truncated 412 chars]',
          "dates.search": ["2 weeks ago"],
        })
      )
    ).toEqual([{ surface: "search", forms: ["2 weeks ago"] }])
  })

  it("drops non-string entries rather than rendering them, and omits a surface left with nothing", () => {
    expect(
      corpusOf(
        bundle({ "dates.home": [null, 42, "3 days ago"], "dates.watch": [] })
      )
    ).toEqual([{ surface: "home", forms: ["3 days ago"] }])
  })
})

describe("exportShape — what lands in the downloaded file", () => {
  it("carries the whole PersistedState through unchanged", () => {
    const b = bundle({ health: HEALTH, "dates.home": ["3 days ago"] })
    const exported = exportShape(b)

    expect(exported.version).toBe(1)
    expect(exported.namespace).toBe("some-censor")
    expect(exported.events).toEqual(b.events)
    expect(exported.metrics).toEqual(b.metrics)
    expect(exported.snapshots).toEqual(b.snapshots)
    expect(exported.dropped).toBe(0)
  })

  it("lifts the recorded health verdict to the top level without removing it from snapshots — a copy, not a second source", () => {
    const exported = exportShape(bundle({ health: HEALTH }))
    expect(exported.health?.score).toBe(100)
    expect(exported.health?.status).toBe("healthy")
    expect(exported.snapshots["health"]).toEqual(HEALTH)
  })

  it("leaves health undefined when no sample has landed, rather than fabricating one", () => {
    expect(exportShape(bundle({})).health).toBeUndefined()
  })

  it("ignores a malformed health snapshot instead of surfacing it as a verdict", () => {
    expect(exportShape(bundle({ health: { score: "fine" } })).health).toBe(
      undefined
    )
  })

  it("discards a verdict whose individual checks are malformed rather than lifting one with holes in it — a bundle can come from an older build", () => {
    const halfValid: JsonValue = {
      score: 100,
      status: "healthy",
      recentErrors: 0,
      generatedAt: NOW,
      invariants: [
        { name: "OccludedCardResolves", status: "ok", details: null },
        { status: "ok", details: null },
      ],
    }
    expect(exportShape(bundle({ health: halfValid })).health).toBeUndefined()
  })

  it("accepts every status the invariant runner can produce, unknown included", () => {
    for (const status of ["ok", "violated", "unknown"]) {
      const h: JsonValue = {
        score: 50,
        status: "degraded",
        recentErrors: 0,
        generatedAt: NOW,
        invariants: [{ name: "PromotionGuardClears", status, details: null }],
      }
      expect(exportShape(bundle({ health: h })).health?.score).toBe(50)
    }
  })

  it("is JSON-serializable, which is the whole point of the download", () => {
    const exported = exportShape(
      bundle({ health: HEALTH, "dates.home": ["3 days ago"] })
    )
    const round: unknown = JSON.parse(JSON.stringify(exported))
    expect(Reflect.get(Object(round), "namespace")).toBe("some-censor")
  })

  it("carries no title, channel name or href — the bundle has none and this adds none (#1382)", () => {
    const serialized = JSON.stringify(
      exportShape(bundle({ health: HEALTH, "dates.home": ["3 days ago"] }))
    )
    expect(serialized).not.toContain("title")
    expect(serialized).not.toContain("channelName")
    expect(serialized).not.toContain("href")
  })
})

describe("diagnosticsFilename", () => {
  it("matches the name #1396 specifies", () => {
    vi.setSystemTime(new Date("2026-09-14T03:27:38.123Z"))
    expect(diagnosticsFilename(new Date())).toBe(
      "some-censor-diagnostics-2026-09-14T03-27-38-123Z.json"
    )
    vi.useRealTimers()
  })

  it("produces a name no filesystem will reject — colons and dots are out of the timestamp", () => {
    const name = diagnosticsFilename(new Date("2026-09-14T03:27:38.123Z"))
    expect(name.startsWith("some-censor-diagnostics-")).toBe(true)
    expect(name.endsWith(".json")).toBe(true)
    expect(name.slice(0, -".json".length)).not.toContain(":")
    expect(name.slice(0, -".json".length)).not.toContain(".")
  })
})
