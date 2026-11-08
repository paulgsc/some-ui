/**
 * Renders with the real ffmpeg on `PATH`, from sources ffmpeg makes here,
 * at a small frame so it runs quickly.
 */

import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { authorshipOf } from "@video-render/authorship"
import type { CutList, Shot, TimedWord } from "@video-render/cut-list"
import { nodePorts } from "@video-render/node"
import { JOIN_BATCH } from "@video-render/plan"
import { DEFAULT_POLICY, MB } from "@video-render/policy"
import type { Ports } from "@video-render/render"
import { render } from "@video-render/render"
import type { Series } from "@video-render/series"
import * as fixtures from "@video-render/testing"
import {
  BACKGROUND_KINDS,
  MOTION_KINDS,
  MUSIC_MODES,
  TRANSITIONS,
} from "@video-render/vocabulary"
import type { CheckedFile, Motion } from "@video-render/vocabulary"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

let root = ""
let ports: Ports
const sums = new Map<string, string>()

const make = (args: ReadonlyArray<string>): Promise<void> =>
  fixtures.make(ports, args)

const sha = async (file: string): Promise<string> =>
  createHash("sha256")
    .update(await readFile(join(root, file)))
    .digest("hex")

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "video-render-"))
  ports = nodePorts(root)
  for (const dir of ["captures", "voice", "kit"]) await ports.mkdir(dir)
  await make([
    "-f",
    "lavfi",
    "-i",
    "testsrc2=s=206x458:r=30:d=8",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "captures/walk.mp4",
  ])
  await make([
    "-f",
    "lavfi",
    "-i",
    "testsrc=s=320x240:d=1",
    "-frames:v",
    "1",
    "captures/still.png",
  ])
  await make([
    "-f",
    "lavfi",
    "-i",
    "color=c=0x335577:s=400x300:d=1",
    "-frames:v",
    "1",
    "kit/backdrop.png",
  ])
  for (const [name, freq, d] of [
    ["voice/a.wav", 330, 1],
    ["voice/b.wav", 440, 0.8],
    ["kit/bed.wav", 110, 2],
    ["kit/click.wav", 1500, 0.05],
    ["kit/whoosh.wav", 600, 0.2],
  ] as const) {
    await make([
      "-f",
      "lavfi",
      "-i",
      `sine=f=${freq}:d=${d}:r=48000`,
      "-c:a",
      "pcm_s16le",
      name,
    ])
  }
  for (const f of [
    "kit/backdrop.png",
    "kit/bed.wav",
    "kit/click.wav",
    "kit/whoosh.wav",
  ]) {
    sums.set(f, await sha(f))
  }
}, 60_000)

afterAll(async () => {
  if (root) await rm(root, { recursive: true, force: true })
})

const checked = (file: string): CheckedFile => ({
  file,
  sha256: sums.get(file) ?? "",
})

const series = (): Series =>
  fixtures.series({
    frame: { width: 216, height: 384, fps: 30 },
    window: { x: 12, y: 48, width: 192, height: 288 },
    music: { bed: checked("kit/bed.wav"), gainDb: -14 },
    sounds: {
      click: checked("kit/click.wav"),
      whoosh: checked("kit/whoosh.wav"),
    },
  })

/** One scene per transition, cycling motions and backgrounds, then a card. */
function everyMember(): CutList {
  const shots: Array<Shot> = TRANSITIONS.map((t, i) => {
    const kind = BACKGROUND_KINDS[i % BACKGROUND_KINDS.length] ?? "as-captured"
    return fixtures.shot(`S${i + 1}`, {
      cut: `c${i + 1}`,
      picture:
        i === 3
          ? { kind: "still", source: "captures/still.png" }
          : fixtures.capture(i * 600, { taps: [400] }),
      durationMs: 1200,
      voiceInMs: 100,
      ...(i === 0
        ? { take: { file: "voice/a.wav", inMs: 0, outMs: 1000 } }
        : {}),
      ...(i === 2
        ? { take: { file: "voice/b.wav", inMs: 0, outMs: 800 } }
        : {}),
      ...(i === 5 ? { look: "lively" as const } : {}),
      overrides: {
        ...(i === 0 ? {} : { transitionIn: t }),
        motion:
          fixtures.MOTIONS[MOTION_KINDS[i % MOTION_KINDS.length] ?? "still"],
        background:
          kind === "image"
            ? { kind, image: checked("kit/backdrop.png") }
            : { kind },
        ...(i === 4 ? { cues: [{ sound: "click" as const, atMs: 200 }] } : {}),
      },
    })
  })
  shots.push(
    fixtures.shot("S7", { picture: { kind: "card" }, durationMs: 900 })
  )
  return fixtures.cutList(shots)
}

async function frames(file: string): Promise<number> {
  const { stdout } = await promisify(execFile)(
    "ffprobe",
    [
      "-v",
      "error",
      "-count_frames",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=nb_read_frames",
      "-of",
      "csv=p=0",
      file,
    ],
    { cwd: root }
  )
  return Number(stdout.trim())
}

describe("render", () => {
  it("draws every vocabulary member, and the same input gives the same bytes", async () => {
    const first = await render(everyMember(), series(), ports, {
      workDir: "work-1",
      out: "out-1/video.mp4",
    })
    if (!first.ok) throw new Error(first.problems.join("\n"))
    const second = await render(everyMember(), series(), ports, {
      workDir: "work-2",
      out: "out-2/video.mp4",
    })
    if (!second.ok) throw new Error(second.problems.join("\n"))

    // Each step's output, so a difference names the step that made it.
    const differ: Array<string> = []
    for (const f of await readdir(join(root, "work-1"))) {
      if ((await sha(`work-1/${f}`)) !== (await sha(`work-2/${f}`))) {
        differ.push(f)
      }
    }
    if ((await sha("out-1/video.mp4")) !== (await sha("out-2/video.mp4"))) {
      differ.push("video.mp4")
      // Which stream: the decoded picture and sound, each hashed.
      for (const [stream, name] of [
        ["0:v", "picture"],
        ["0:a", "sound"],
      ] as const) {
        for (const k of [1, 2]) {
          await make([
            "-i",
            `out-${k}/video.mp4`,
            "-map",
            stream,
            "-f",
            "md5",
            `out-${k}/${name}.md5`,
          ])
        }
        if (
          (await sha(`out-1/${name}.md5`)) !== (await sha(`out-2/${name}.md5`))
        ) {
          differ.push(`video.mp4 ${name}`)
        }
      }
    }
    // Its banner, on stderr, names the version that made the bytes.
    const banner = await ports.ffmpeg({
      args: [
        "-f",
        "lavfi",
        "-i",
        "nullsrc",
        "-frames:v",
        "1",
        "-f",
        "null",
        "-",
      ],
    })
    const version = banner.stderr.split("\n")[0]
    expect({ differ, version }).toEqual({ differ: [], version })

    const { shotTimes, shotTimesFile } = first.value
    const last = shotTimes[shotTimes.length - 1]
    if (!last) throw new Error("no shot times")
    // Every frame the placement promised, and no more.
    expect(await frames("out-1/video.mp4")).toBe(
      Math.round(((last.startMs + last.durationMs) * 30) / 1000)
    )
    const written: unknown = JSON.parse(
      await readFile(join(root, shotTimesFile), "utf8")
    )
    expect(written).toEqual(shotTimes)
  }, 180_000)

  it.each(MUSIC_MODES)(
    "renders the music bed %s",
    async (music) => {
      const cut = everyMember()
      const done = await render(
        { ...cut, music, shots: cut.shots.slice(0, 2) },
        series(),
        ports,
        { workDir: `work-${music}`, out: `out-${music}/video.mp4` }
      )
      expect(done.ok ? [] : done.problems).toEqual([])
    },
    60_000
  )

  /** `n` scenes of footage, each in by `transition` (the first by a cut). */
  const long = (n: number, transition: "crossfade" | "cut"): CutList =>
    fixtures.cutList(
      Array.from({ length: n }, (_, i) =>
        fixtures.shot(`L${i + 1}`, {
          picture: fixtures.capture((i % 8) * 600),
          durationMs: 1000,
          overrides: i === 0 ? {} : { transitionIn: transition },
        })
      )
    )

  it("joins a video longer than a batch in parts: every frame, the same bytes (VR1)", async () => {
    const n = JOIN_BATCH * 2 + 3
    const cut = long(n, "crossfade")
    const mixed: CutList = {
      ...cut,
      shots: cut.shots.map((s, i) => {
        const joined =
          i % 4 === 3
            ? {
                ...s,
                overrides: { ...s.overrides, transitionIn: "cut" as const },
              }
            : s
        // A scene named like a part, in the second batch: its segment must
        // stay its own, never be overwritten by the first batch's join.
        return i === JOIN_BATCH + 2 ? { ...joined, id: "part-1" } : joined
      }),
    }
    const runs = []
    for (const k of [1, 2]) {
      const done = await render(mixed, series(), ports, {
        workDir: `work-long-${k}`,
        out: `out-long-${k}/video.mp4`,
      })
      if (!done.ok) throw new Error(done.problems.join("\n"))
      runs.push(done.value)
    }
    const parts = (await readdir(join(root, "work-long-1/parts"))).filter((f) =>
      /^\d+\.mkv$/.test(f)
    )
    expect(parts.length).toBe(Math.ceil(n / JOIN_BATCH))
    // Its segment holds its own scene's frames, not a batch's.
    const own = runs[0]?.shotTimes.find((t) => t.id === "part-1")
    if (!own) throw new Error("no part-1 scene")
    expect(await frames("work-long-1/part-1.mkv")).toBe(
      Math.round((own.durationMs * 30) / 1000)
    )
    const last = runs[0]?.shotTimes.at(-1)
    if (!last) throw new Error("no shot times")
    expect(await frames("out-long-1/video.mp4")).toBe(
      Math.round(((last.startMs + last.durationMs) * 30) / 1000)
    )
    expect(await sha("out-long-1/video.mp4")).toBe(
      await sha("out-long-2/video.mp4")
    )
  }, 120_000)

  // VR1 (promise): no ffmpeg call the renderer makes opens more than
  // JOIN_BATCH scene segments, and every call that draws picture decodes each
  // input on one thread and encodes on two, whatever the video's length.
  // Family: scene counts 1 to 60 (a call has at most 57), each joined by
  // crossfades or by cuts. Proof: every member, rendered with ffmpeg faked.
  it("holds at most a batch of segments in any ffmpeg call, for 1 to 60 scenes (VR1)", async () => {
    const calls: Array<ReadonlyArray<string>> = []
    const faked: Ports = {
      ...ports,
      probe: () =>
        Promise.resolve({ width: 206, height: 458, durationMs: 8000 }),
      ffmpeg: (call) => {
        calls.push(call.args)
        return Promise.resolve({ ok: true, stderr: "" })
      },
    }
    for (const transition of ["crossfade", "cut"] as const) {
      for (let n = 1; n <= 60; n += 1) {
        calls.length = 0
        const done = await render(long(n, transition), series(), faked, {
          workDir: `work-vr1-${transition}-${n}`,
          out: `out-vr1-${transition}-${n}/video.mp4`,
        })
        expect(done.ok ? [] : done.problems).toEqual([])
        for (const args of calls) {
          const inputs = args.flatMap((a, i) =>
            a === "-i" ? [args[i + 1] ?? ""] : []
          )
          const segments = inputs.filter((f) => f.endsWith(".mkv"))
          expect(
            segments.length,
            `${transition} ${n}: ${args.join(" ")}`
          ).toBeLessThanOrEqual(JOIN_BATCH)
          if (!args.includes("-filter_complex") || args.includes("-vn"))
            continue
          if (!args.some((a) => a === "[v]")) continue
          expect(args).toEqual(
            expect.arrayContaining(["-filter_complex_threads"])
          )
          args.forEach((a, i) => {
            if (a === "-i") {
              const before = args.slice(0, i)
              const opened = before.lastIndexOf("-threads")
              expect(
                opened,
                `${transition} ${n}: ${inputs.join(" ")}`
              ).toBeGreaterThanOrEqual(0)
              expect(args[opened + 1]).toBe("1")
            }
          })
          const out = args.lastIndexOf("-threads")
          expect(args[out + 1]).toBe("2")
        }
      }
    }
  }, 120_000)

  it("refuses a video past the policy's length before drawing anything", async () => {
    const calls: Array<ReadonlyArray<string>> = []
    const faked: Ports = {
      ...ports,
      probe: () =>
        Promise.resolve({ width: 206, height: 458, durationMs: 8000 }),
      ffmpeg: (call) => {
        calls.push(call.args)
        return Promise.resolve({ ok: true, stderr: "" })
      },
    }
    const done = await render(long(3, "cut"), series(), faked, {
      workDir: "work-too-long",
      out: "out-too-long/video.mp4",
      policy: { ...DEFAULT_POLICY, maxVideoMs: 2_000 },
    })
    expect(done.ok ? [] : done.problems).toEqual([
      "the video would run 0.1 min, past the policy's 0.0 min",
    ])
    expect(calls).toEqual([])
  })

  it("removes and refuses a finished video past the policy's size", async () => {
    const removed: Array<string> = []
    const faked: Ports = {
      ...ports,
      probe: () =>
        Promise.resolve({ width: 206, height: 458, durationMs: 8000 }),
      ffmpeg: () => Promise.resolve({ ok: true, stderr: "" }),
      fileBytes: () => Promise.resolve(600 * MB),
      remove: (file) => {
        removed.push(file)
        return Promise.resolve()
      },
    }
    const done = await render(long(2, "cut"), series(), faked, {
      workDir: "work-too-big",
      out: "out-too-big/video.mp4",
    })
    expect(done.ok ? [] : done.problems).toEqual([
      "the video is 600 MB, past the policy's 500 MB",
    ])
    expect(removed).toEqual(["out-too-big/video.mp4"])
  })

  it("needs footage only up to a freeze", async () => {
    const short: Ports = {
      ...ports,
      probe: () =>
        Promise.resolve({ width: 206, height: 458, durationMs: 1000 }),
      ffmpeg: () => Promise.resolve({ ok: true, stderr: "" }),
    }
    const scene = (motion: Motion): CutList =>
      fixtures.cutList([
        fixtures.shot("S1", {
          picture: fixtures.capture(0, { taps: [400] }),
          durationMs: 5000,
          overrides: { motion },
        }),
      ])
    const options = { workDir: "work-freeze", out: "out-freeze/video.mp4" }
    const frozen = await render(
      scene({ kind: "freeze", atMs: 500 }),
      series(),
      short,
      options
    )
    expect(frozen.ok ? [] : frozen.problems).toEqual([])
    const held = await render(
      scene({ kind: "still" }),
      series(),
      short,
      options
    )
    expect(held.ok ? [] : held.problems).toEqual([
      "S1: captures/walk.mp4 is too short (5000 ms needed)",
    ])
  })

  it("refuses a changed background before drawing anything", async () => {
    const cut = everyMember()
    const done = await render(
      {
        ...cut,
        shots: cut.shots.map((s, i) =>
          i === 2
            ? {
                ...s,
                overrides: {
                  ...s.overrides,
                  background: {
                    kind: "image",
                    image: { file: "kit/backdrop.png", sha256: "0".repeat(64) },
                  },
                },
              }
            : s
        ),
      },
      series(),
      ports,
      { workDir: "work-changed", out: "out-changed/video.mp4" }
    )
    expect(done.ok ? [] : done.problems).toEqual([
      "S3's background: kit/backdrop.png changed since it was chosen",
    ])
    expect(await ports.probe("out-changed/video.mp4")).toBeNull()
  })

  it("lays burn-ins over the video, or lists what it left out", async () => {
    const cut = everyMember()
    const word = (text: string, startMs: number, endMs: number): TimedWord => ({
      text,
      startMs,
      endMs,
    })
    const withLayers: CutList = {
      ...cut,
      shots: cut.shots.slice(0, 2).map((s) => ({
        ...s,
        // S1's take says two lines; its last word is past the take's trim.
        ...(s.take
          ? {
              take: {
                ...s.take,
                words: [
                  word("Every", 0, 250),
                  word("word.", 300, 500),
                  word("Next", 600, 900),
                  word("cut", 1100, 1300),
                ],
              },
            }
          : {}),
        burnIns: [
          { kind: "headline", design: "v1", params: { headline: s.id } },
        ],
      })),
      burnIns: [
        { kind: "captions", design: "gridiron", params: {} },
        { kind: "authorship", design: "cells-v1", params: {} },
      ],
    }
    const refused = await render(withLayers, series(), ports, {
      workDir: "work-b0",
      out: "out-b0/video.mp4",
    })
    expect(refused.ok).toBe(false)

    const leftOut = await render(withLayers, series(), ports, {
      workDir: "work-b1",
      out: "out-b1/video.mp4",
      withoutBurnIns: true,
    })
    expect(
      leftOut.ok ? leftOut.value.leftOut.map((b) => b.kind) : leftOut.problems
    ).toEqual(["authorship", "headline", "headline", "captions"])

    const asked: Array<string> = []
    const clashing = await render(
      withLayers,
      series(),
      {
        ...ports,
        checkBurnIns: (requests) => {
          asked.push(...requests.map((r) => r.kind))
          return Promise.resolve(["the headline and the card clash"])
        },
        recordBurnIn: () => Promise.reject(new Error("nothing records")),
      },
      { workDir: "work-b3", out: "out-b3/video.mp4" }
    )
    expect(clashing.ok ? [] : clashing.problems).toEqual([
      "the headline and the card clash",
    ])
    expect(asked).toEqual(["authorship", "headline", "headline", "captions"])

    const recorded: Array<string> = []
    const marks: Array<unknown> = []
    const captions: Array<unknown> = []
    const drawn = await render(
      withLayers,
      series(),
      {
        ...ports,
        recordBurnIn: async (r) => {
          recorded.push(`${r.kind}@${r.startFrame}+${r.frames}`)
          if (r.kind === "authorship") marks.push(r.params)
          if (r.kind === "captions") captions.push(r.params)
          const d = (r.frames / r.frame.fps).toFixed(3)
          const { width, height, fps } = r.frame
          const ran = await ports.ffmpeg({
            args: [
              "-v",
              "error",
              "-y",
              "-f",
              "lavfi",
              "-i",
              `color=c=red@0.4:s=${width}x${height}:r=${fps}:d=${d},format=rgba`,
              "-c:v",
              "png",
              r.out,
            ],
          })
          return ran.ok
        },
      },
      { workDir: "work-b2", out: "out-b2/video.mp4" }
    )
    expect(drawn.ok ? drawn.value.leftOut : drawn.problems).toEqual([])
    expect(marks).toEqual([
      {
        scenes: authorshipOf(withLayers).map((a, i) => ({
          startMs: [0, 800][i],
          origin: a.origin,
          wording: a.wording,
          hands: a.hands,
        })),
        endMs: 2000,
      },
    ])
    expect(recorded).toEqual([
      "authorship@0+60",
      // The first scene's headline ends where the crossfade into the second
      // begins, so the two are never up together.
      "headline@0+24",
      "headline@24+36",
      // SFEED11: S1's captions alone, for as long as it shows before S2,
      // in its own time; S2 says nothing, so it has none.
      "captions@0+24",
    ])
    // The words heard, from where the take starts in the scene (100 ms),
    // as the speaker's two sentences.
    expect(captions).toEqual([
      {
        lines: [
          { words: [word("Every", 100, 350), word("word.", 400, 600)] },
          { words: [word("Next", 700, 1000)] },
        ],
      },
    ])
    expect(await frames("out-b2/video.mp4")).toBe(60)
  }, 120_000)
})
