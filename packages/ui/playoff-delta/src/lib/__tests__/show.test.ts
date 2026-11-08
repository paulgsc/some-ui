/**
 * The show (SH1, SH2): each pinned format version parses, the newest is the
 * one the code makes, so a change to the slides (their order, names, points
 * or holds) fails here until a new version is pinned; and every week of the
 * bundled 2025 season and of 2026's published weeks, and the legend, makes
 * an episode whose facts carry the slide's own numbers.
 */
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { SAMPLE_SEASON } from "@playoff-delta/lib/sample"
import {
  episodeFor,
  FORMAT_VERSION,
  formatId,
  formatOf,
  uploadOf,
  type FormatKind,
} from "@playoff-delta/lib/show"
import {
  LEGEND_SLIDES,
  LEGEND_WEEK,
  WEEK_SLIDES,
} from "@playoff-delta/lib/slides"
import { parseStorySeason, wins } from "@playoff-delta/lib/story"
import { storyboardFor } from "@playoff-delta/lib/voiced"
import { parseFormat, versionOfFile } from "@some-ui/video-render"
import { TEMPLATES_DIR } from "@some-ui/video-render/node"
import { describe, expect, it } from "vitest"

import raw2026 from "./season-2026.json"

const SEASON_2026 = parseStorySeason(raw2026)

/** Every pinned version of a format, oldest first, from its folder. */
function versionsOf(
  kind: FormatKind
): ReadonlyArray<{ readonly version: number; readonly raw: unknown }> {
  const dir = join(TEMPLATES_DIR, formatId(kind))
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
      expect(versions.at(-1)?.version).toBe(FORMAT_VERSION[kind])
      // A pinned version is never edited: the code still makes each one.
      for (const v of versions) expect(v.raw).toEqual(formatOf(kind, v.version))
    }
  )

  it.each(["week", "legend"] as const)(
    "%s: the pinned storyboard is the code's (SFEED3)",
    (kind) => {
      const file = join(TEMPLATES_DIR, formatId(kind), "storyboard.json")
      const raw: unknown = JSON.parse(readFileSync(file, "utf8"))
      expect(raw).toEqual(storyboardFor(kind))
    }
  )
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
      const got = episodeFor(season, week, SUM, () => 0)
      if (!got.ok) throw new Error(got.problems.join("; "))
      const e = got.value
      const slides = week === LEGEND_WEEK ? LEGEND_SLIDES : WEEK_SLIDES
      expect(e.cuts.map((c) => c.id)).toEqual([...slides])
      expect(e.episode.data).toEqual({
        source: `playoff-delta/${season.label}/${season.team}.json`,
        sha256: SUM,
      })
      // The copy Finish shows is the week's own, pinned with the episode.
      expect(e.episode.upload).toEqual(
        uploadOf(season, season.weeks.find((w) => w.week === week) ?? null)
      )
      if (week === LEGEND_WEEK) return
      const after = season.weeks.find((w) => w.week === week)?.poles.after
      const division = e.cuts.find((c) => c.id === "division")
      expect(division?.keep[0]).toMatch(
        new RegExp(`^The floor: ${wins(after?.division.floor ?? -1)}, `)
      )
      expect(e.cuts.every((c) => c.keep.length > 0)).toBe(true)
    }
  )

  it("says the season has no such week", () => {
    expect(episodeFor(SEASON_2026, 30, SUM, () => 0)).toEqual({
      ok: false,
      problems: ["the season has no week 30"],
    })
  })
})
