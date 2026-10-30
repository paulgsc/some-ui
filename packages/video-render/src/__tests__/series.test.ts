/**
 * A series is a folder of versions (STUDIO ST11): two videos render from one
 * series at different versions, and a newer version, one that changes a
 * burn-in's design included, leaves a video pinned to an older one
 * byte-identical. A version's intro and outro open and close every video
 * that pins it, inside the authorship mark's bare cards. Renders with the
 * real ffmpeg on `PATH`, at a small frame.
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { authorshipOf } from "@video-render/authorship"
import type { Shot } from "@video-render/cut-list"
import { nodePorts, readSeries, renderFolder } from "@video-render/node"
import type { BurnInRequest } from "@video-render/render"
import { readReview } from "@video-render/review"
import sample from "@video-render/sample/series/build-journal-short/v1.json"
import {
  parseSeries,
  SERIES_INTRO,
  SERIES_OUTRO,
  seriesFile,
  withSeries,
} from "@video-render/series"
import type { Series } from "@video-render/series"
import { cutList, series, shot } from "@video-render/testing"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

let root = ""
const SERIES_DIR = "series"

/** A version of the fixture series, its captions drawn in `design`. */
const version = (n: number, design: string): Series =>
  series({
    version: n,
    frame: { width: 216, height: 384, fps: 30 },
    window: { x: 12, y: 48, width: 192, height: 288 },
    music: undefined,
    sounds: {},
    designs: { captions: design },
  })

async function publish(s: Series): Promise<void> {
  await writeFile(
    join(root, SERIES_DIR, seriesFile(s.version)),
    JSON.stringify(s)
  )
}

/** A video of two cards under captions, pinning `pinned`. */
async function video(name: string, pinned: number): Promise<void> {
  await mkdir(join(root, name))
  const cut = cutList(
    [
      shot("S1", { picture: { kind: "card" }, durationMs: 500 }),
      shot("S2", { picture: { kind: "card" }, durationMs: 500 }),
    ],
    {
      series: { id: "fixture", version: pinned },
      look: "plain",
      burnIns: [{ kind: "captions", params: {} }],
    }
  )
  await writeFile(join(root, name, "cut-list.json"), JSON.stringify(cut))
}

/** Draws each design as its own colour, so a changed design changes bytes. */
const COLOUR: Readonly<Record<string, string>> = {
  gridiron: "red",
  chalk: "blue",
  broadcast: "green",
}

async function rendered(
  name: string,
  n: number
): Promise<{ readonly sum: string; readonly designs: Array<string> }> {
  const ports = nodePorts(join(root, name))
  const designs: Array<string> = []
  const record = async (r: BurnInRequest): Promise<boolean> => {
    designs.push(r.design)
    const { width, height, fps } = r.frame
    const d = (r.frames / fps).toFixed(3)
    const c = COLOUR[r.design] ?? "white"
    const ran = await ports.ffmpeg({
      args: [
        ...["-v", "error", "-y", "-f", "lavfi", "-i"],
        `color=c=${c}@0.4:s=${width}x${height}:r=${fps}:d=${d},format=rgba`,
        ...["-c:v", "png", r.out],
      ],
    })
    return ran.ok
  }
  const done = await renderFolder(join(root, name), join(root, SERIES_DIR), {
    workDir: `work-${n}`,
    out: `out-${n}/video.mp4`,
    recordBurnIn: record,
  })
  if (!done.ok) throw new Error(done.problems.join("\n"))
  return { sum: (await ports.sha256(done.value.video)) ?? "", designs }
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "video-series-"))
  await mkdir(join(root, SERIES_DIR))
  await publish(version(1, "gridiron"))
  await publish(version(2, "chalk"))
  await video("A", 1)
  await video("B", 2)
}, 60_000)

afterAll(async () => {
  if (root) await rm(root, { recursive: true, force: true })
})

describe("a series' versions", () => {
  it("render each video from the version it pins, and a new version changes none of them", async () => {
    const a = await rendered("A", 1)
    const b = await rendered("B", 1)
    expect(a.designs).toEqual(["gridiron"])
    expect(b.designs).toEqual(["chalk"])
    expect(a.sum).not.toBe(b.sum)

    await publish(version(3, "broadcast"))
    expect((await rendered("A", 2)).sum).toBe(a.sum)
    expect((await rendered("B", 2)).sum).toBe(b.sum)
  }, 120_000)

  it("refuses a version the folder lacks, or a file that is another version", async () => {
    await video("C", 9)
    const missing = await renderFolder(
      join(root, "C"),
      join(root, SERIES_DIR),
      {
        workDir: "work",
        out: "out/video.mp4",
      }
    )
    expect(missing.ok ? [] : missing.problems).toEqual([
      `${join(root, SERIES_DIR)} holds no version 9 of its series`,
    ])
    await writeFile(
      join(root, SERIES_DIR, seriesFile(9)),
      JSON.stringify(version(2, "chalk"))
    )
    const misnamed = await readSeries(join(root, SERIES_DIR), 9)
    expect(misnamed.ok ? [] : misnamed.problems).toEqual([
      "v9.json says it is version 2",
    ])
    await writeFile(join(root, SERIES_DIR, seriesFile(9)), "{ not json")
    const broken = await readSeries(join(root, SERIES_DIR), 9)
    expect(broken.ok ? [] : broken.problems).toEqual([
      expect.stringMatching(/^v9\.json can't be read: /),
    ])
    await rm(join(root, SERIES_DIR, seriesFile(9)))
  })

  it("opens the newest when no version is asked for", async () => {
    await publish(version(3, "broadcast"))
    const newest = await readSeries(join(root, SERIES_DIR))
    expect(newest.ok ? newest.value.version : newest.problems).toBe(3)
  })
})

describe("the sample series", () => {
  it("are each a series", async () => {
    for (const id of [
      "build-journal-short",
      "playoff-delta-week",
      "long-episode",
    ]) {
      const s = await readSeries(join(__dirname, "../sample/series", id), 1)
      expect(s.ok ? s.value.id : s.problems).toBe(id)
    }
  })

  it("refuses a window outside the frame", () => {
    const parsed = parseSeries({
      ...sample,
      window: { x: 54, y: 250, width: 1080, height: 1450 },
    })
    expect(parsed.ok ? [] : parsed.problems).toEqual([
      "window: the window doesn't fit inside the frame",
    ])
  })
})

describe("a series' intro and outro", () => {
  const card = { kind: "card" } as const
  const bare = (id: string): Shot => shot(id, { picture: card })
  const framed = series({
    intro: {
      picture: card,
      durationMs: 600,
      burnIns: [{ kind: "card", params: { title: "Build Journal" } }],
    },
    outro: { picture: card, durationMs: 400, burnIns: [] },
  })
  const ids = (shots: ReadonlyArray<Shot>): Array<string> =>
    shots.map((s) => s.id)

  it("sit just inside the authorship mark's bare cards", () => {
    const cut = cutList([bare("open"), shot("S1"), shot("S2"), bare("end")], {
      burnIns: [{ kind: "authorship", params: {} }],
    })
    const drawn = withSeries(cut, framed)
    expect(drawn.ok && ids(drawn.value.shots)).toEqual([
      "open",
      SERIES_INTRO,
      "S1",
      "S2",
      SERIES_OUTRO,
      "end",
    ])
  })

  it("open and close a video without the mark", () => {
    const drawn = withSeries(cutList([shot("S1")]), framed)
    expect(drawn.ok && ids(drawn.value.shots)).toEqual([
      SERIES_INTRO,
      "S1",
      SERIES_OUTRO,
    ])
  })

  it("leave a video under a series without them as it is", () => {
    const cut = cutList([shot("S1")])
    const drawn = withSeries(cut, series())
    expect(drawn.ok && drawn.value).toEqual(cut)
  })

  it("count in the record as an agent's idea and wording, made by code", () => {
    const cut = cutList([bare("open"), shot("S1"), bare("end")], {
      burnIns: [{ kind: "authorship", params: {} }],
    })
    const drawn = withSeries(cut, framed)
    const record = drawn.ok ? authorshipOf(drawn.value) : []
    expect(
      record
        .filter((a) => a.shot === SERIES_INTRO || a.shot === SERIES_OUTRO)
        .map((a) => [a.origin, a.wording, a.hands.join("+")])
    ).toEqual([
      ["agent", "agent", "code"],
      ["agent", "agent", "code"],
    ])
  })

  it("refuse a video whose own scene takes a series scene's id", () => {
    const drawn = withSeries(cutList([shot(SERIES_INTRO)]), framed)
    expect(drawn.ok ? [] : drawn.problems).toEqual([
      `${SERIES_INTRO}: the series' own scene takes this id`,
    ])
  })

  it("never carry the authorship mark, which covers the whole video", () => {
    const parsed = parseSeries({
      ...sample,
      intro: {
        picture: card,
        durationMs: 600,
        burnIns: [{ kind: "authorship", params: {} }],
      },
    })
    expect(parsed.ok ? [] : parsed.problems).toEqual([
      "intro: the authorship mark covers the whole video, not one scene",
    ])
  })

  it("render with the video, and the review names only the video's own scenes", async () => {
    const dir = join(root, "framed-series")
    await mkdir(dir)
    await writeFile(
      join(dir, seriesFile(1)),
      JSON.stringify({
        ...version(1, "gridiron"),
        intro: { picture: card, durationMs: 400, burnIns: [] },
        outro: { picture: card, durationMs: 300, burnIns: [] },
      })
    )
    await mkdir(join(root, "D"))
    const cut = cutList([bare("S1"), bare("S2")], {
      series: { id: "fixture", version: 1 },
      look: "plain",
      revisions: [
        {
          rev: 1,
          author: "claude",
          message: "First cut",
          at: "2026-10-30T20:00:00.000Z",
        },
      ],
    })
    await writeFile(join(root, "D", "cut-list.json"), JSON.stringify(cut))
    const done = await renderFolder(join(root, "D"), dir, {
      workDir: "work",
      out: "out/video.mp4",
    })
    if (!done.ok) throw new Error(done.problems.join("\n"))
    expect(done.value.shotTimes.map((t) => t.id)).toEqual([
      SERIES_INTRO,
      "S1",
      "S2",
      SERIES_OUTRO,
    ])
    const review = readReview(
      await readFile(join(root, "D", "out", "review.json"), "utf8")
    )
    if (!review.ok) throw new Error(review.problems.join("\n"))
    expect(review.value.shotTimes.map((t) => [t.id, t.startMs])).toEqual([
      ["S1", 400],
      ["S2", 2400],
    ])
  }, 60_000)
})
