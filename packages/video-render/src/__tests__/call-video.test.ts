/**
 * CV1 (promise, #2671): every scene of a call's video shows the whole still
 * the stage recorded and holds it still, from its first frame to its last.
 *
 * Family: every week (how many scenes, and how long each is said), every
 * frame of a scene's hold, and the transitions into and out of it. Proof:
 * the call's own cut list (`callCutList`) for the sample week and the week
 * of 2026-10-30, rendered by the real ffmpeg on `PATH` in the call's own
 * series at a small frame. Each scene's still is a dark field framed by a
 * white border at the frame's edges; every frame of each scene's hold (its
 * frames outside the transitions) must be the same frame, and must show the
 * border on all four sides. "The same" allows the encoder's own noise, a
 * level or so of 255. A zoom, pan or crop moves the frames or cuts
 * the border off, as the calm look's push-in did on the first call.
 *
 * The week of 2026-10-30 is read from `paulgsc/testing` at the commit that
 * added it, since data lives there and not here. Without a network it is
 * skipped locally and fails under CI.
 */

import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  callCutList,
  callFile,
  callScenes,
  parseCallWeek,
  sampleCallWeek,
} from "@video-render/call"
import type { CallWeek } from "@video-render/call"
import { nodePorts } from "@video-render/node"
import type { Ports } from "@video-render/render"
import { render } from "@video-render/render"
import { SeriesSchema } from "@video-render/series"
import type { Series } from "@video-render/series"
import { TRANSITION_MS } from "@video-render/vocabulary"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

const W = 128
const H = 72
const FPS = 30
/** How wide the border each still is framed by is, in pixels. */
const BORDER = 4
/** The most a pixel of a held still may differ from frame to frame. */
const NOISE = 8
/** Each scene's take, so a scene is short and has a hold past its fades. */
const TAKE_MS = 600

const OCT_30 =
  "https://raw.githubusercontent.com/paulgsc/testing/aecb9131591e1ee443f34caff32ae564af569844/call/2026-10-30.json"

let root = ""
let ports: Ports
let oct30: CallWeek | null = null

async function make(args: ReadonlyArray<string>): Promise<void> {
  const ran = await ports.ffmpeg({ args: ["-v", "error", "-y", ...args] })
  if (!ran.ok) throw new Error(ran.stderr)
}

/** The call's series, as pinned, drawn at the small frame. */
async function callSeries(): Promise<Series> {
  const raw: unknown = JSON.parse(
    await readFile(
      join(import.meta.dirname, "../sample/series/conference-call/v1.json"),
      "utf8"
    )
  )
  const series = SeriesSchema.parse(raw)
  return {
    ...series,
    frame: { width: W, height: H, fps: FPS },
    window: { x: 0, y: 0, width: W, height: H },
  }
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "call-video-"))
  ports = nodePorts(root)
  await make([
    "-f",
    "lavfi",
    "-i",
    `sine=f=330:d=${TAKE_MS / 1000}:r=48000`,
    "-c:a",
    "pcm_s16le",
    "take.wav",
  ])
  try {
    const response = await fetch(OCT_30)
    if (!response.ok) throw new Error(`${OCT_30}: ${String(response.status)}`)
    const parsed = parseCallWeek(await response.json())
    if (!parsed.ok) throw new Error(parsed.problems.join("; "))
    oct30 = parsed.value
  } catch (error) {
    // Under CI an unread week is a failure, never a skip that proved nothing.
    if (process.env["CI"]) throw error
  }
}, 60_000)

afterAll(async () => {
  if (root) await rm(root, { recursive: true, force: true })
})

/** Renders `week`'s call into `dir`, each scene a framed still. */
async function renderWeek(
  week: CallWeek,
  dir: string
): Promise<{
  readonly frames: Buffer
  readonly holds: ReadonlyArray<{ id: string; from: number; to: number }>
}> {
  await ports.mkdir(dir)
  const scenes = callScenes(week)
  for (const [i, scene] of scenes.entries()) {
    const file = callFile(i, scene.id)
    // A different dark field per scene, so a frame of the next scene can't
    // pass for this one's.
    const shade = 16 + ((i * 7) % 64)
    const hex = shade.toString(16).padStart(2, "0")
    await make([
      "-f",
      "lavfi",
      "-i",
      `color=c=white:s=${W}x${H}:d=1`,
      "-vf",
      `drawbox=x=${BORDER}:y=${BORDER}:w=${W - 2 * BORDER}:h=${H - 2 * BORDER}:color=0x${hex}${hex}${hex}:t=fill`,
      "-frames:v",
      "1",
      `${dir}/${file}.png`,
    ])
    await make(["-i", "take.wav", "-c", "copy", `${dir}/${file}.wav`])
  }
  const cut = callCutList(
    week,
    scenes.map(() => TAKE_MS)
  )
  const prefixed = {
    ...cut,
    shots: cut.shots.map((s) => ({
      ...s,
      picture:
        s.picture.kind === "still"
          ? { ...s.picture, source: `${dir}/${s.picture.source}` }
          : s.picture,
      ...(s.take ? { take: { ...s.take, file: `${dir}/${s.take.file}` } } : {}),
    })),
  }
  const done = await render(prefixed, await callSeries(), ports, {
    workDir: `${dir}/work`,
    out: `${dir}/call.mp4`,
    withoutBurnIns: true,
  })
  if (!done.ok) throw new Error(done.problems.join("\n"))
  await make([
    "-i",
    `${dir}/call.mp4`,
    "-f",
    "rawvideo",
    "-pix_fmt",
    "gray",
    `${dir}/frames.gray`,
  ])
  const frames = await readFile(join(root, dir, "frames.gray"))
  const fade = Math.round((TRANSITION_MS.crossfade / 1000) * FPS)
  const holds = done.value.shotTimes.map((t, i, all) => {
    const start = Math.round((t.startMs / 1000) * FPS)
    const end = start + Math.round((t.durationMs / 1000) * FPS)
    return {
      id: t.id,
      from: start + (i === 0 ? 0 : fade),
      to: end - (i === all.length - 1 ? 0 : fade),
    }
  })
  return { frames, holds }
}

const at = (frame: Buffer, x: number, y: number): number =>
  frame[y * W + x] ?? -1

/** Why scene `id`'s hold isn't its whole still, held: none when it is. */
function problemsOf(
  frames: Buffer,
  hold: { id: string; from: number; to: number }
): Array<string> {
  const size = W * H
  const frame = (n: number): Buffer => frames.subarray(n * size, (n + 1) * size)
  const first = frame(hold.from)
  const problems: Array<string> = []
  if (hold.to - hold.from < 2) problems.push(`${hold.id}: it holds no frames`)
  // The border, on each side, half its width in: the still, shown whole.
  const edge = Math.floor(BORDER / 2)
  for (const [x, y, side] of [
    [edge, H / 2, "left"],
    [W - 1 - edge, H / 2, "right"],
    [W / 2, edge, "top"],
    [W / 2, H - 1 - edge, "bottom"],
  ] as const) {
    if (at(first, x, y) < 200)
      problems.push(`${hold.id}: its ${side} edge is cut off`)
  }
  if (at(first, W / 2, H / 2) > 120)
    problems.push(`${hold.id}: its middle isn't its own still`)
  for (let n = hold.from + 1; n < hold.to; n++) {
    const f = frame(n)
    let most = 0
    for (let k = 0; k < size; k++)
      most = Math.max(most, Math.abs((f[k] ?? 0) - (first[k] ?? 0)))
    // The encoder's own noise on a still is a level or so; any motion moves
    // the border by a whole pixel, a change of about 200.
    if (most > NOISE) {
      problems.push(`${hold.id}: frame ${n - hold.from} of its hold moved`)
      break
    }
  }
  return problems
}

describe("a call's video (CV1)", () => {
  it("shows each scene's whole still and holds it, for the sample week", async () => {
    const sample = sampleCallWeek()
    if (!sample.ok) throw new Error(sample.problems.join("; "))
    const { frames, holds } = await renderWeek(sample.value, "sample")
    expect(holds).toHaveLength(callScenes(sample.value).length)
    expect(holds.flatMap((h) => problemsOf(frames, h))).toEqual([])
  }, 240_000)

  it("shows each scene's whole still and holds it, for the week of 2026-10-30", async (context) => {
    if (oct30 === null) {
      context.skip()
      return
    }
    const { frames, holds } = await renderWeek(oct30, "oct-30")
    expect(holds).toHaveLength(36)
    expect(holds.flatMap((h) => problemsOf(frames, h))).toEqual([])
  }, 240_000)
})
