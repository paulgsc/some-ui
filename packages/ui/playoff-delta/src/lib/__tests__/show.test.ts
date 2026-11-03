/**
 * The show (SH1, SH2): each pinned format version parses, the newest is the
 * one the code makes, so a change to the slides fails here until a new
 * version is pinned; and every week of the bundled 2025 season and of
 * 2026's published weeks, and the legend, makes an episode whose cuts are
 * the stage's slides, in order, with the stage's holds and the slide's own
 * numbers among its facts.
 */
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { SAMPLE_SEASON } from "@playoff-delta/lib/sample"
import {
  episodeFor,
  FORMAT_VERSION,
  formatId,
  formatOf,
  type FormatKind,
} from "@playoff-delta/lib/show"
import {
  HOLD_MS,
  LEGEND_SLIDES,
  LEGEND_WEEK,
  WEEK_SLIDES,
} from "@playoff-delta/lib/slides"
import { parseStorySeason, wins } from "@playoff-delta/lib/story"
import { parseFormat, versionOfFile } from "@some-ui/video-render"
import { describe, expect, it } from "vitest"

import raw2026 from "./season-2026.json"

const SEASON_2026 = parseStorySeason(raw2026)

/** Every pinned version of a format, oldest first, from its folder. */
function versionsOf(
  kind: FormatKind
): ReadonlyArray<{ readonly version: number; readonly raw: unknown }> {
  const dir = join(import.meta.dirname, "../../show/formats", formatId(kind))
  return readdirSync(dir)
    .map((file) => ({ file, version: versionOfFile(file) }))
    .filter((f): f is { file: string; version: number } => f.version !== null)
    .map(({ file, version }) => {
      const raw: unknown = JSON.parse(readFileSync(join(dir, file), "utf8"))
      return { version, raw }
    })
    .sort((a, b) => a.version - b.version)
}

const SUM = "0".repeat(64)

describe("the formats", () => {
  it.each(["week", "legend"] as const)(
    "%s: every pinned version parses, and the newest is the code's",
    (kind) => {
      const versions = versionsOf(kind)
      expect(versions.length).toBeGreaterThan(0)
      for (const v of versions) {
        const parsed = parseFormat(v.raw)
        expect(parsed.ok && parsed.value.version).toBe(v.version)
      }
      expect(versions.at(-1)?.version).toBe(FORMAT_VERSION)
      expect(versions.at(-1)?.raw).toEqual(formatOf(kind))
    }
  )

  it("has every slide the stage shows, in order, with its hold", () => {
    for (const [kind, slides] of [
      ["week", WEEK_SLIDES],
      ["legend", LEGEND_SLIDES],
    ] as const) {
      expect(formatOf(kind).scenes.map((s) => [s.id, s.holdMs])).toEqual(
        slides.map((id) => [id, HOLD_MS[id]])
      )
    }
  })
})

describe("an episode", () => {
  const cases = [
    ...SAMPLE_SEASON.weeks.map((w) => [SAMPLE_SEASON, w.week] as const),
    ...SEASON_2026.weeks.map((w) => [SEASON_2026, w.week] as const),
    [SAMPLE_SEASON, LEGEND_WEEK] as const,
  ]

  it.each(cases)(
    "%#: one cut per slide, with the slide's numbers",
    (season, week) => {
      const got = episodeFor(season, week, SUM)
      if (!got.ok) throw new Error(got.problems.join("; "))
      const e = got.value
      const slides = week === LEGEND_WEEK ? LEGEND_SLIDES : WEEK_SLIDES
      expect(e.cuts.map((c) => [c.id, c.targetSec * 1000])).toEqual(
        slides.map((id) => [id, HOLD_MS[id]])
      )
      expect(e.episode.data).toEqual({
        source: `playoff-delta/${season.label}/${season.team}.json`,
        sha256: SUM,
      })
      if (week === LEGEND_WEEK) return
      const after = season.weeks.find((w) => w.week === week)?.poles.after
      const division = e.cuts.find((c) => c.id === "division")
      expect(division?.keep[0]).toMatch(
        new RegExp(`^The floor: ${wins(after?.division.floor ?? -1)}, `)
      )
      expect(e.cuts.every((c) => c.keep.length > 0)).toBe(true)
    }
  )

  it("is the same bytes for the same week and data", () => {
    const a = episodeFor(SEASON_2026, 7, SUM)
    const b = episodeFor(SEASON_2026, 7, SUM)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it("says the season has no such week", () => {
    expect(episodeFor(SEASON_2026, 30, SUM)).toEqual({
      ok: false,
      problems: ["the season has no week 30"],
    })
  })
})
