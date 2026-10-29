/**
 * Renders with the real ffmpeg on `PATH` (the `ci` nix shell carries one,
 * `nix/video`): a short fixture whose scenes use every transition, motion
 * and background between them, with takes, sound cues and a music bed, all
 * made here from ffmpeg's own test sources. Small frames keep it quick.
 */

import { createHash } from "node:crypto"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { CUT_LIST_SCHEMA } from "@video-render/cut-list"
import type { CutList, Shot } from "@video-render/cut-list"
import { nodePorts } from "@video-render/node"
import type { Ports } from "@video-render/render"
import { render } from "@video-render/render"
import { SERIES_SCHEMA } from "@video-render/series"
import type { Series } from "@video-render/series"
import { MOTION_KINDS, TRANSITIONS } from "@video-render/vocabulary"
import type {
  BackgroundKind,
  Motion,
  Transition,
} from "@video-render/vocabulary"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

let root = ""
let ports: Ports
const sums = new Map<string, string>()

async function make(args: ReadonlyArray<string>): Promise<void> {
  const ran = await ports.ffmpeg({ args: ["-v", "error", "-y", ...args] })
  if (!ran.ok) throw new Error(ran.stderr)
}

const sha = async (file: string): Promise<string> =>
  createHash("sha256")
    .update(await readFile(join(root, file)))
    .digest("hex")

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "video-render-"))
  ports = nodePorts(root)
  await ports.mkdir("captures")
  await ports.mkdir("voice")
  await ports.mkdir("kit")
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

const checked = (file: string): { file: string; sha256: string } => ({
  file,
  sha256: sums.get(file) ?? "",
})

function series(): Series {
  return {
    schema: SERIES_SCHEMA,
    id: "fixture",
    version: 1,
    title: "Fixture",
    frame: { width: 216, height: 384, fps: 30 },
    ground: "#111821",
    window: { x: 12, y: 48, width: 192, height: 288 },
    defaultLook: "calm",
    music: { bed: checked("kit/bed.wav"), gainDb: -14 },
    sounds: {
      click: checked("kit/click.wav"),
      whoosh: checked("kit/whoosh.wav"),
    },
    soundGainDb: -8,
  }
}

const MOTIONS: Readonly<Record<Motion["kind"], Motion>> = {
  still: { kind: "still" },
  "push-in": { kind: "push-in", amount: 0.1 },
  "pull-out": { kind: "pull-out", amount: 0.1 },
  pan: {
    kind: "pan",
    keys: [
      [0, 0],
      [800, 200],
    ],
  },
  "punch-in": { kind: "punch-in", at: [300, 800], amount: 0.2 },
  freeze: { kind: "freeze", atMs: 500 },
}

const BACKGROUNDS: ReadonlyArray<BackgroundKind> = [
  "as-captured",
  "blurred",
  "image",
]

function capture(inMs: number): Shot["picture"] {
  return {
    kind: "capture",
    source: "captures/walk.mp4",
    inMs,
    speed: 1,
    cssWidth: 206,
    framing: { mode: "crop", zoom: 1, x: 0, y: 0 },
    taps: [400],
  }
}

/** One scene per transition, cycling motions and backgrounds, then a card. */
function everyMember(): CutList {
  const shots: Array<Shot> = TRANSITIONS.map((t: Transition, i) => {
    const kind = BACKGROUNDS[i % BACKGROUNDS.length] ?? "as-captured"
    const motion = MOTIONS[MOTION_KINDS[i % MOTION_KINDS.length] ?? "still"]
    return {
      id: `S${i + 1}`,
      cut: `c${i + 1}`,
      picture:
        i === 3
          ? { kind: "still", source: "captures/still.png" }
          : capture(i * 600),
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
        transitionIn: t,
        motion,
        background:
          kind === "image"
            ? { kind, image: checked("kit/backdrop.png") }
            : { kind },
        ...(i === 4 ? { cues: [{ sound: "click" as const, atMs: 200 }] } : {}),
      },
      burnIns: [],
    }
  })
  shots.push({
    id: "S7",
    picture: { kind: "card" },
    durationMs: 900,
    voiceInMs: 200,
    overrides: {},
    burnIns: [],
  })
  return {
    schema: CUT_LIST_SCHEMA,
    title: "Every member",
    series: { id: "fixture", version: 1 },
    look: "calm",
    voice: "ad-lib",
    shots,
    burnIns: [],
    revisions: [],
    notes: [],
  }
}

async function frames(file: string): Promise<number> {
  const ran = await new Promise<string>((done) => {
    void import("node:child_process").then(({ execFile }) =>
      execFile(
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
        { cwd: root },
        (_e, out) => done(String(out))
      )
    )
  })
  return Number(ran.trim())
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

    expect(await sha("out-1/video.mp4")).toBe(await sha("out-2/video.mp4"))
    const last = first.shotTimes[first.shotTimes.length - 1]
    if (!last) throw new Error("no shot times")
    // Every frame the placement promised, and no more.
    expect(await frames("out-1/video.mp4")).toBe(
      Math.round(((last.startMs + last.durationMs) * 30) / 1000)
    )
    const written: unknown = JSON.parse(
      await readFile(join(root, first.shotTimesFile), "utf8")
    )
    expect(written).toEqual(first.shotTimes)
  }, 180_000)

  it("renders each music mode", async () => {
    for (const music of ["off", "under-voice", "up-between-lines"] as const) {
      const cut = everyMember()
      const done = await render(
        { ...cut, music, shots: cut.shots.slice(0, 2) },
        series(),
        ports,
        { workDir: `work-${music}`, out: `out-${music}/video.mp4` }
      )
      expect(done.ok ? "rendered" : done.problems).toBe("rendered")
    }
  }, 180_000)

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
    const withLayers: CutList = {
      ...cut,
      shots: cut.shots.slice(0, 2).map((s) => ({
        ...s,
        burnIns: [
          { kind: "headline", design: "v1", params: { headline: s.id } },
        ],
      })),
      burnIns: [{ kind: "captions", design: "gridiron", params: {} }],
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
      leftOut.ok ? leftOut.leftOut.map((b) => b.kind) : leftOut.problems
    ).toEqual(["captions", "headline", "headline"])

    const recorded: Array<string> = []
    const drawn = await render(
      withLayers,
      series(),
      {
        ...ports,
        recordBurnIn: async (r) => {
          recorded.push(`${r.kind}@${r.startFrame}+${r.frames}`)
          const d = (r.frames / r.frame.fps).toFixed(3)
          const ran = await ports.ffmpeg({
            args: [
              "-v",
              "error",
              "-y",
              "-f",
              "lavfi",
              "-i",
              `color=c=red@0.4:s=${r.frame.width}x${r.frame.height}:r=${r.frame.fps}:d=${d},format=rgba`,
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
    expect(drawn.ok ? drawn.leftOut : drawn.problems).toEqual([])
    expect(recorded).toEqual([
      "captions@0+60",
      "headline@0+36",
      "headline@24+36",
    ])
  }, 120_000)
})
