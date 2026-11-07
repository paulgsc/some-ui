/**
 * CV1 (promise, #2671): every scene of a call's video shows the whole still
 * the stage recorded and holds it still, from its first frame to its last.
 *
 * Family: every week (how many scenes, how long each is said), every frame
 * of a scene's hold, the transitions into and out of it, and the frame's
 * shape: the call's 16:9 and a short's 9:16, which Playoff Delta's voiced
 * episodes are (FEED3, `stillsCutList` makes both cut lists). Proof: the
 * call's own cut list, for the sample week and the week of 2026-10-30, each
 * scene said for a different length (`TAKES_MS`), rendered by the real
 * ffmpeg in the call's pinned series at a small frame of each shape, each still a dark
 * field in a white border at the frame's edges. Every frame of the video,
 * transitions included, has the border exactly where it was drawn, so no
 * frame is zoomed, panned or cropped; and every frame of a scene's hold is
 * its first. Tolerance: the encoder's own noise (`NOISE`).
 *
 * The week of 2026-10-30 is read from `paulgsc/testing` at the commit that
 * added it, since data lives there and not here. Without a network it is
 * skipped locally and fails under CI.
 */

import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  CALL_ID,
  callCutList,
  callFormat,
  callScenes,
  parseCallWeek,
  sampleCallWeek,
} from "@video-render/call"
import type { CallWeek } from "@video-render/call"
import { nodePorts, readSeries } from "@video-render/node"
import { render } from "@video-render/render"
import type { Series } from "@video-render/series"
import { stillFile } from "@video-render/stills"
import { subtitleBand } from "@video-render/subtitles"
import { make } from "@video-render/testing"
import { TRANSITION_MS } from "@video-render/vocabulary"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

/** The frames rendered: the call's 16:9, and a short's 9:16 (Playoff Delta's). */
type Shape = { readonly W: number; readonly H: number }
const WIDE: Shape = { W: 128, H: 72 }
const TALL: Shape = { W: 72, H: 128 }
const FPS = 30
const BORDER = 4
/**
 * The most a pixel of a held still may differ from frame to frame: the
 * encoder's noise on a still is a level or so, and any motion moves the
 * border by a whole pixel, a change of about 200.
 */
const NOISE = 8
/** Each scene's take, by its place in the week: short, long and between. */
const TAKES_MS = [300, 2_100, 900, 600] as const
const takeMs = (i: number): number => TAKES_MS[i % TAKES_MS.length] ?? 600

const OCT_30 =
  "https://raw.githubusercontent.com/paulgsc/testing/aecb9131591e1ee443f34caff32ae564af569844/call/2026-10-30.json"

let root = ""
let pinned: Series
let oct30: CallWeek | null = null

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "call-video-"))
  const read = await readSeries(
    join(import.meta.dirname, "../sample/series", CALL_ID),
    callFormat().series.version
  )
  if (!read.ok) throw new Error(read.problems.join("; "))
  pinned = read.value
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

type Hold = { readonly id: string; readonly from: number; readonly to: number }

/**
 * `week`'s call rendered in its own folder, each scene a framed still, in a
 * frame of `shape`: the series' own, its picture filling the frame.
 */
type Rendered = { frames: Buffer; holds: ReadonlyArray<Hold> }

/** Each render by its folder's name, so two tests of one render share it. */
const rendered = new Map<string, Promise<Rendered>>()

function renderWeek(
  week: CallWeek,
  name: string,
  options: { readonly subtitles?: boolean; readonly shape?: Shape } = {}
): Promise<Rendered> {
  const kept = rendered.get(name) ?? renderNew(week, name, options)
  rendered.set(name, kept)
  return kept
}

async function renderNew(
  week: CallWeek,
  name: string,
  {
    subtitles = false,
    shape = WIDE,
  }: { readonly subtitles?: boolean; readonly shape?: Shape }
): Promise<Rendered> {
  const { W, H } = shape
  const series: Series = {
    ...pinned,
    frame: { width: W, height: H, fps: FPS },
    window: { x: 0, y: 0, width: W, height: H },
  }
  const dir = join(root, name)
  await mkdir(dir)
  const ports = nodePorts(dir)
  for (const ms of TAKES_MS) {
    await make(ports, [
      "-f",
      "lavfi",
      "-i",
      `sine=f=330:d=${ms / 1000}:r=48000`,
      "-c:a",
      "pcm_s16le",
      `take-${ms}.wav`,
    ])
  }
  const scenes = callScenes(week)
  for (const [i, scene] of scenes.entries()) {
    const file = stillFile(i, scene.id)
    // A different dark field per scene, so the next scene's frame can't pass
    // for this one's.
    const hex = (16 + ((i * 7) % 64)).toString(16).padStart(2, "0")
    await make(ports, [
      "-f",
      "lavfi",
      "-i",
      `color=c=white:s=${W}x${H}:d=1`,
      "-vf",
      `drawbox=x=${BORDER}:y=${BORDER}:w=${W - 2 * BORDER}:h=${H - 2 * BORDER}:color=0x${hex}${hex}${hex}:t=fill`,
      "-frames:v",
      "1",
      `${file}.png`,
    ])
    await make(ports, [
      "-i",
      `take-${takeMs(i)}.wav`,
      "-c",
      "copy",
      `${file}.wav`,
    ])
  }
  // Each take's words, spread over it, when the subtitles are drawn.
  const takes = scenes.map((s, i) => {
    if (s.said === "") return null
    const ms = takeMs(i)
    const said = s.said.split(/\s+/).slice(0, 12)
    const each = Math.floor(ms / said.length)
    return {
      ms,
      words: said.map((text, k) => ({
        text,
        startMs: k * each,
        endMs: (k + 1) * each - 1,
      })),
    }
  })
  const { subtitles: style, ...rest } = callCutList(week, takes)
  const cut = subtitles ? { ...rest, subtitles: style } : rest
  const done = await render(cut, series, ports, {
    workDir: "work",
    out: "call.mp4",
    withoutBurnIns: true,
  })
  if (!done.ok) throw new Error(done.problems.join("\n"))
  await make(ports, [
    "-i",
    "call.mp4",
    "-f",
    "rawvideo",
    "-pix_fmt",
    "gray",
    "frames.gray",
  ])
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
  return { frames: await readFile(join(dir, "frames.gray")), holds }
}

/**
 * Where a frame's border isn't where the still drew it: on each side, the
 * border's innermost pixel is white and the next one in is dark, so a move
 * of a pixel either way, or a crop, is seen.
 */
function moved(frame: Buffer, { W, H }: Shape): Array<string> {
  const at = (x: number, y: number): number => frame[y * W + x] ?? -1
  const sides = [
    ["left", (d: number): number => at(d, H / 2)],
    ["right", (d: number): number => at(W - 1 - d, H / 2)],
    ["top", (d: number): number => at(W / 2, d)],
    ["bottom", (d: number): number => at(W / 2, H - 1 - d)],
  ] as const
  return sides
    .filter(([, px]) => px(BORDER - 1) < 200 || px(BORDER) > 120)
    .map(([side]) => side)
}

/** Every frame whose border moved, by the scene showing it: none when none. */
function everyFrame(
  frames: Buffer,
  holds: ReadonlyArray<Hold>,
  shape: Shape = WIDE
): Array<string> {
  const size = shape.W * shape.H
  const problems: Array<string> = []
  for (let n = 0; n * size < frames.length; n++) {
    const sides = moved(frames.subarray(n * size, (n + 1) * size), shape)
    if (sides.length === 0) continue
    const near = holds.filter((h) => h.from <= n).at(-1)?.id ?? "the start"
    problems.push(`frame ${n} (around ${near}): its ${sides.join(", ")} moved`)
  }
  return problems
}

/** Why a scene's hold isn't its whole still, held: none when it is. */
function problemsOf(
  frames: Buffer,
  hold: Hold,
  { W, H }: Shape = WIDE
): Array<string> {
  const size = W * H
  const frame = (n: number): Buffer => frames.subarray(n * size, (n + 1) * size)
  const first = frame(hold.from)
  const at = (x: number, y: number): number => first[y * W + x] ?? -1
  const problems: Array<string> = []
  if (hold.to - hold.from < 2) problems.push(`${hold.id}: it holds no frames`)
  const edge = Math.floor(BORDER / 2)
  for (const [x, y, side] of [
    [edge, H / 2, "left"],
    [W - 1 - edge, H / 2, "right"],
    [W / 2, edge, "top"],
    [W / 2, H - 1 - edge, "bottom"],
  ] as const) {
    if (at(x, y) < 200) problems.push(`${hold.id}: its ${side} edge is cut off`)
  }
  if (at(W / 2, H / 2) > 120)
    problems.push(`${hold.id}: its middle isn't its own still`)
  for (let n = hold.from + 1; n < hold.to; n++) {
    const f = frame(n)
    let most = 0
    for (let k = 0; k < size; k++)
      most = Math.max(most, Math.abs((f[k] ?? 0) - (first[k] ?? 0)))
    if (most > NOISE) {
      problems.push(`${hold.id}: frame ${n - hold.from} of its hold moved`)
      break
    }
  }
  return problems
}

describe("a call's subtitles", () => {
  it.each([
    ["16:9", WIDE],
    ["9:16", TALL],
  ] as const)(
    "are drawn in the band at a %s frame's foot, and nowhere over the picture",
    async (name, shape) => {
      const sample = sampleCallWeek()
      if (!sample.ok) throw new Error(sample.problems.join("; "))
      const tag = name.replace(":", "x")
      const plain = await renderWeek(sample.value, `plain-${tag}`, { shape })
      const said = await renderWeek(sample.value, `said-${tag}`, {
        subtitles: true,
        shape,
      })
      expect(said.frames.length).toBe(plain.frames.length)
      const { W, H } = shape
      const size = W * H
      const above = (H - subtitleBand(H, W).bandPx) * W
      let drawn = 0
      for (let n = 0; n * size < said.frames.length; n++) {
        const a = said.frames.subarray(n * size, (n + 1) * size)
        const b = plain.frames.subarray(n * size, (n + 1) * size)
        for (let k = 0; k < size; k++) {
          const differs = Math.abs((a[k] ?? 0) - (b[k] ?? 0)) > NOISE
          if (differs && k < above)
            throw new Error(`frame ${n}: a subtitle drew over the picture`)
          if (differs) drawn++
        }
      }
      expect(drawn).toBeGreaterThan(0)
    },
    240_000
  )
})

describe("a call's video (CV1)", () => {
  it("shows each scene's whole still and holds it, for the sample week", async () => {
    const sample = sampleCallWeek()
    if (!sample.ok) throw new Error(sample.problems.join("; "))
    const { frames, holds } = await renderWeek(sample.value, "sample")
    expect(holds).toHaveLength(callScenes(sample.value).length)
    expect(holds.flatMap((h) => problemsOf(frames, h))).toEqual([])
    expect(everyFrame(frames, holds)).toEqual([])
  }, 240_000)

  it("shows each scene's whole still and holds it in a 9:16 frame, a short's", async () => {
    const sample = sampleCallWeek()
    if (!sample.ok) throw new Error(sample.problems.join("; "))
    // The same render the 9:16 subtitles case compares against.
    const { frames, holds } = await renderWeek(sample.value, "plain-9x16", {
      shape: TALL,
    })
    expect(holds.flatMap((h) => problemsOf(frames, h, TALL))).toEqual([])
    expect(everyFrame(frames, holds, TALL)).toEqual([])
  }, 240_000)

  it("shows each scene's whole still and holds it, for the week of 2026-10-30", async (context) => {
    if (oct30 === null) {
      context.skip()
      return
    }
    const { frames, holds } = await renderWeek(oct30, "oct-30")
    expect(holds).toHaveLength(callScenes(oct30).length)
    expect(holds.flatMap((h) => problemsOf(frames, h))).toEqual([])
    expect(everyFrame(frames, holds)).toEqual([])
  }, 240_000)
})
