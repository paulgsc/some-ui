/**
 * A show's format (SH1) is a folder of versions, read as a series is, and an
 * episode (SH2) is that format applied to one period's data: one primer cut
 * and one cut-list scene per scene shown, in order, pinned to the format,
 * the series and the data's sum.
 */

import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { clipFile, episodeOf } from "@video-render/episode"
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
      picture: { kind: "capture", from: "the open slide" },
      holdMs: 6000,
    },
    {
      id: "extra",
      name: "Extra",
      picture: { kind: "card" },
      holdMs: 4000,
      skip: "left out when nothing happened",
    },
    {
      id: "close",
      name: "The close",
      picture: { kind: "capture", from: "the close slide" },
      holdMs: 5000,
    },
  ],
})

const SUM = "a".repeat(64)

const input = (says: EpisodeInput["says"]): EpisodeInput => ({
  title: "Weekly, week 3",
  period: "week 3",
  data: { source: "weekly/3.json", sha256: SUM },
  says,
  clip: (id, i) => ({ source: clipFile(id, i), inMs: 900 }),
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
    const got = episodeOf(
      format(1),
      input([
        { point: "How it opened", keep: ["3 wins"] },
        null,
        { point: "How it closed", keep: [] },
      ])
    )
    if (!got.ok) throw new Error(got.problems.join("; "))
    const e = got.value
    expect(e.version).toBe(2)
    expect(e.cuts.map((c) => [c.id, c.artifact, c.targetSec])).toEqual([
      ["open", "The open", 6],
      ["close", "The close", 5],
    ])
    expect(e.cutList.shots.map((s) => [s.id, s.cut, s.durationMs])).toEqual([
      ["open", "open", 6000],
      ["close", "close", 5000],
    ])
    expect(e.cutList.shots[1]?.picture).toMatchObject({
      kind: "capture",
      source: "02-close.webm",
      inMs: 900,
    })
    expect(e.episode).toEqual({
      schema: "some-ui.show-episode/1",
      format: { id: "weekly", version: 1 },
      period: "week 3",
      data: { source: "weekly/3.json", sha256: SUM },
    })
    expect(e.cutList.series).toEqual({ id: "weekly", version: 1 })
  })

  it("says what is wrong instead of guessing", () => {
    const short = episodeOf(format(1), input([null]))
    expect(short.ok).toBe(false)
    const none = episodeOf(format(1), input([null, null, null]))
    expect(none.ok).toBe(false)
  })
})
