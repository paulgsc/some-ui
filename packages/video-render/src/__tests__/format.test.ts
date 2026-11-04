/**
 * A show's format (SH1) is a folder of versions, read as a series is, and an
 * episode (SH2) is that format applied to one period's data: one primer cut
 * and one cut-list scene per scene shown, in order, pinned to the format,
 * the series and the data's sum.
 */

import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  clipFile,
  episodeOf,
  parseEpisode,
  UPLOAD_DESCRIPTION_MAX_BYTES,
  UPLOAD_TITLE_MAX_CHARS,
  UploadCopySchema,
} from "@video-render/episode"
import type { EpisodeInput } from "@video-render/episode"
import { FORMAT_SCHEMA, parseFormat } from "@video-render/format"
import type { Format } from "@video-render/format"
import { readFormat } from "@video-render/node"
import { versionFile } from "@video-render/series"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

const format = (version: number): Format => ({
  schema: FORMAT_SCHEMA,
  id: "weekly",
  version,
  title: "Weekly",
  series: { id: "weekly", version: 1 },
  look: "calm",
  scenes: [
    {
      id: "open",
      name: "The open",
      point: "How it opened",
      picture: { kind: "capture", from: "the open slide", cssWidth: 1080 },
      holdMs: 6000,
    },
    {
      id: "extra",
      name: "Extra",
      point: "What else happened",
      picture: { kind: "card" },
      holdMs: 4000,
      skip: "left out when nothing happened",
    },
    {
      id: "close",
      name: "The close",
      point: "How it closed",
      picture: { kind: "capture", from: "the close slide", cssWidth: 1080 },
      holdMs: 5000,
    },
  ],
})

const SUM = "a".repeat(64)

const input = (keep: EpisodeInput["keep"]): EpisodeInput => ({
  show: "Weekly",
  title: "Weekly, week 3",
  period: "week 3",
  data: { source: "weekly/3.json", sha256: SUM },
  upload: { title: "Weekly · week 3", description: "Week 3, as it went." },
  keep,
  inMs: (i) => 900 + i,
})

describe("a format", () => {
  it("parses, and refuses two scenes with one id", () => {
    expect(parseFormat(format(1)).ok).toBe(true)
    const twice = format(1)
    const bad = parseFormat({
      ...twice,
      scenes: [...twice.scenes, twice.scenes[0]],
    })
    expect(bad.ok).toBe(false)
  })

  describe("as a folder of versions", () => {
    let dir = ""
    beforeAll(async () => {
      dir = await mkdtemp(join(tmpdir(), "format-"))
      for (const v of [1, 2])
        await writeFile(join(dir, versionFile(v)), JSON.stringify(format(v)))
    })
    afterAll(() => rm(dir, { recursive: true, force: true }))

    it("reads the newest, or the one asked for", async () => {
      const newest = await readFormat(dir)
      expect(newest.ok && newest.value.version).toBe(2)
      const pinned = await readFormat(dir, 1)
      expect(pinned.ok && pinned.value.version).toBe(1)
      expect((await readFormat(dir, 3)).ok).toBe(false)
    })
  })
})

describe("an episode", () => {
  it("is a cut and a scene per scene shown, in order, pinned", () => {
    const got = episodeOf(format(1), input([["3 wins"], null, []]))
    if (!got.ok) throw new Error(got.problems.join("; "))
    const e = got.value
    expect(e.version).toBe(2)
    expect(e.cuts.map((c) => [c.id, c.point, c.targetSec])).toEqual([
      ["open", "How it opened", 6],
      ["close", "How it closed", 5],
    ])
    expect(e.cutList.shots.map((s) => [s.id, s.cut, s.durationMs])).toEqual([
      ["open", "open", 6000],
      ["close", "close", 5000],
    ])
    // A clip is named and timed by its scene's place in the format.
    expect(e.cutList.shots[1]?.picture).toMatchObject({
      kind: "capture",
      source: clipFile("close", 2),
      inMs: 902,
      cssWidth: 1080,
    })
    expect(e.episode).toEqual({
      schema: "some-ui.show-episode/1",
      show: "Weekly",
      format: { id: "weekly", version: 1 },
      period: "week 3",
      data: { source: "weekly/3.json", sha256: SUM },
      upload: { title: "Weekly · week 3", description: "Week 3, as it went." },
    })
    expect(e.cutList.series).toEqual({ id: "weekly", version: 1 })
  })

  it("leaves a scene out only where the format says it may", () => {
    const strict = episodeOf(format(1), input([null, [], []]))
    expect(strict).toEqual({
      ok: false,
      problems: ["open: the format never leaves this scene out"],
    })
    expect(episodeOf(format(1), input([[], [], []])).ok).toBe(true)
  })

  it("says what is wrong instead of guessing", () => {
    expect(episodeOf(format(1), input([[]])).ok).toBe(false)
  })
})

describe("an upload's copy", () => {
  const fits = (title: string, description: string): boolean =>
    UploadCopySchema.safeParse({ title, description }).success

  it("fits YouTube's limits, counting a title in characters and a description in bytes", () => {
    expect(fits("é".repeat(UPLOAD_TITLE_MAX_CHARS), "a")).toBe(true)
    expect(fits("a".repeat(UPLOAD_TITLE_MAX_CHARS + 1), "a")).toBe(false)
    // Two bytes each: 2,500 fit, one more does not.
    const half = UPLOAD_DESCRIPTION_MAX_BYTES / 2
    expect(fits("a", "é".repeat(half))).toBe(true)
    expect(fits("a", "é".repeat(half + 1))).toBe(false)
  })

  it("refuses what YouTube refuses, and nothing at all", () => {
    expect(fits("Week <3>", "a")).toBe(false)
    expect(fits("a", "1 > 0")).toBe(false)
    expect(fits(" ", "a")).toBe(false)
    expect(fits("a", "")).toBe(false)
  })

  it("may be absent from an episode file made before shows carried one", () => {
    const made = episodeOf(format(1), input([[], [], []]))
    if (!made.ok) throw new Error(made.problems.join("; "))
    const { upload: _, ...pins } = made.value.episode
    expect(parseEpisode({ ...made.value, episode: pins }).ok).toBe(true)
  })
})

describe("an episode file", () => {
  const made = episodeOf(format(1), input([["3 wins"], null, []]))
  if (!made.ok) throw new Error(made.problems.join("; "))
  const file: unknown = JSON.parse(JSON.stringify(made.value))

  it("reads back as the episode written", () => {
    expect(parseEpisode(file)).toEqual({ ok: true, value: made.value })
  })

  it("is not a bare primer, nor one whose scenes are not its cuts", () => {
    const { cutList: _, ...primer } = made.value
    expect(parseEpisode(primer).ok).toBe(false)
    const shots = [...made.value.cutList.shots].reverse()
    const swapped = { ...made.value, cutList: { ...made.value.cutList, shots } }
    expect(parseEpisode(swapped)).toEqual({
      ok: false,
      problems: ["cutList: its scenes are not the primer's cuts, in order"],
    })
  })
})
