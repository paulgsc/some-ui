/**
 * The ffmpeg calls that draw a video, as data. Pure: given the resolved
 * scenes, where each sits (`timing.ts`) and what each source file is (its
 * size and length, read by the runtime), it returns argument lists, so a
 * test can check every vocabulary member without running ffmpeg, and the
 * runtime only runs what is written here.
 *
 * Four steps: each scene to a segment (picture only, a whole number of
 * frames); the voice, placed and measured for -16 LUFS, as the build-journal
 * skill's `render.py` did; the sound, mixing the levelled voice, the music
 * bed and the sound cues; then one assembly that joins the segments with
 * their transitions, lays the burn-ins over them, and adds the sound.
 *
 * Every output is written bit-exact (no encoder tags, no metadata, no
 * timestamps), so the same inputs and the same ffmpeg give the same bytes.
 */

import { assertNever } from "@some-ui/core-utils"

import type { Capture } from "./cut-list"
import type { ResolvedShot } from "./resolve"
import type { Series } from "./series"
import type { Placed } from "./timing"
import { toMs } from "./timing"
import type { Motion, MusicMode, Transition } from "./vocabulary"

/** What the runtime read about a source file. */
export type SourceFacts = {
  readonly width: number
  readonly height: number
  readonly durationMs: number
}

export type Facts = ReadonlyMap<string, SourceFacts>

export type FfmpegCall = { readonly args: ReadonlyArray<string> }

const QUIET = ["-hide_banner", "-nostdin", "-v", "error", "-y"]
const BITEXACT = [
  "-fflags",
  "+bitexact",
  "-flags:v",
  "+bitexact",
  "-flags:a",
  "+bitexact",
  "-map_metadata",
  "-1",
  "-map_chapters",
  "-1",
]

/** Seconds, exact to the microsecond, as ffmpeg reads them. */
const sec = (ms: number): string => (ms / 1000).toFixed(6)

/**
 * A frame's time, from the frame count rather than rounded ms: a transition
 * placed even a fraction of a frame off lets ffmpeg pick either neighbour,
 * which drops frames and changes from run to run.
 */
const at = (frames: number, fps: number): string => (frames / fps).toFixed(6)
const even = (n: number): number => Math.max(2, 2 * Math.round(n / 2))

/** Any audio, as the mixer takes it. */
const MONO = "aresample=48000,aformat=sample_fmts=fltp:channel_layouts=mono"

/** How long a punch-in takes to arrive, in ms. */
export const PUNCH_MS = 150

/** ffmpeg's `xfade` name for each transition; a cut is a join instead. */
const XFADE: Readonly<Record<Exclude<Transition, "cut">, string>> = {
  crossfade: "fade",
  "dip-to-black": "fadeblack",
  "slide-up": "slideup",
  wipe: "wipeleft",
  zoom: "zoomin",
}

type Box = { readonly width: number; readonly height: number }

/** The picture's size in the window: the window, or the source fitted in it. */
export function pictureBox(
  shot: ResolvedShot,
  series: Series,
  facts: Facts
): Box {
  const p = shot.shot.picture
  const win = series.window
  if (p.kind === "card") return win
  if (p.kind === "capture" && p.framing.mode === "crop") return win
  const f = facts.get(p.source)
  if (!f) throw new Error(`${shot.shot.id}: no facts for ${p.source}`)
  const k = Math.min(win.width / f.width, win.height / f.height)
  return { width: even(f.width * k), height: even(f.height * k) }
}

/**
 * The zoom factor over time, as an ffmpeg expression in `t` (seconds into
 * the scene), or null for a picture that does not zoom.
 */
export function zoomExpr(motion: Motion, durationMs: number): string | null {
  const d = Math.max(0.001, durationMs / 1000)
  switch (motion.kind) {
    case "still":
    case "pan":
    case "freeze": {
      return null
    }
    case "push-in": {
      return `(1+${motion.amount}*min(t/${d},1))`
    }
    case "pull-out": {
      return `(1+${motion.amount}*(1-min(t/${d},1)))`
    }
    case "punch-in": {
      // In at the first time, back out at the next, and so on: each step
      // eases over PUNCH_MS and then holds.
      const ramp = PUNCH_MS / 1000
      const steps = motion.at.map((ms, k) => {
        const sign = k % 2 === 0 ? "+" : "-"
        return `${sign}${motion.amount}*min(max((t-${ms / 1000})/${ramp},0),1)`
      })
      return `max(1,1${steps.join("")})`
    }
    default: {
      return assertNever(motion)
    }
  }
}

/**
 * The crop's top edge over time, in source pixels, as an expression in `t`:
 * eased between the pan's keys, held before the first and after the last.
 */
export function panExpr(
  keys: ReadonlyArray<readonly [number, number]>,
  toPx: (cssY: number) => number
): string {
  const ks = keys.map(([ms, y]) => [ms / 1000, toPx(y)] as const)
  const last = ks[ks.length - 1]
  const first = ks[0]
  if (!first || !last) return "0"
  let expr = String(last[1])
  for (let i = ks.length - 2; i >= 0; i--) {
    const a = ks[i]
    const b = ks[i + 1]
    if (!a || !b) continue
    const span = Math.max(0.01, b[0] - a[0])
    const seg =
      a[1] === b[1]
        ? String(a[1])
        : `${a[1]}+(${b[1] - a[1]})*(1-cos(PI*(t-${a[0]})/${span}))/2`
    expr = `if(lt(t,${b[0]}),${seg},${expr})`
  }
  return `if(lt(t,${first[0]}),${first[1]},${expr})`
}

/** The crop that frames a capture in the window, before any zoom. */
function captureCrop(
  p: Capture,
  motion: Motion,
  win: Box,
  f: SourceFacts
): string {
  if (p.framing.mode === "full") return ""
  const scale = f.width / p.cssWidth
  // The window's shape, as wide as the zoom allows and no taller than the
  // source; a source wider than the window is cropped at its sides.
  const wide = Math.min(f.width, even(f.width / p.framing.zoom))
  const ch = Math.min(f.height, even((win.height * wide) / win.width))
  const cw = Math.min(wide, even((win.width * ch) / win.height))
  const cx = Math.max(
    0,
    Math.min(f.width - cw, Math.round(p.framing.x * scale))
  )
  const toPx = (cssY: number): number =>
    Math.max(0, Math.min(f.height - ch, Math.round(cssY * scale)))
  const y =
    motion.kind === "pan"
      ? panExpr(motion.keys, toPx)
      : String(toPx(p.framing.y))
  return `crop=${cw}:${ch}:${cx}:'${y}',`
}

/**
 * The source's frames on the scene's clock: trimmed to its out (or its
 * freeze), at its speed, then its last frame held for as long as the scene
 * runs, so a take longer than the action freezes the picture, never repeats
 * it.
 */
function timeChain(shot: ResolvedShot, fps: number, frames: number): string {
  const p = shot.shot.picture
  if (p.kind !== "capture") return `fps=${fps}`
  const freezeAt =
    shot.motion.kind === "freeze" ? shot.motion.atMs * p.speed : null
  const outSpan = p.outMs === undefined ? null : p.outMs - p.inMs
  const span = [freezeAt, outSpan].filter((x) => x !== null)
  return [
    // trim reads a duration of 0 as none, so a freeze at 0 keeps one frame.
    !span.length
      ? ""
      : Math.min(...span) > 0
        ? `trim=duration=${sec(Math.min(...span))}`
        : "trim=end_frame=1",
    p.speed === 1 ? "setpts=PTS-STARTPTS" : `setpts=(PTS-STARTPTS)/${p.speed}`,
    `tpad=stop_mode=clone:stop_duration=${at(frames + fps, fps)}`,
    `fps=${fps}`,
  ]
    .filter(Boolean)
    .join(",")
}

/** The frames on the scene's clock, framed, moved and scaled to its box. */
function spaceChain(
  shot: ResolvedShot,
  series: Series,
  facts: Facts,
  box: Box,
  frames: number
): string {
  const p = shot.shot.picture
  const durationMs = toMs(frames, series.frame.fps)
  const parts: Array<string> = []
  if (p.kind === "capture") {
    const f = facts.get(p.source)
    if (!f) throw new Error(`${shot.shot.id}: no facts for ${p.source}`)
    parts.push(captureCrop(p, shot.motion, series.window, f).replace(/,$/, ""))
  }
  parts.push(`scale=${box.width}:${box.height}:flags=lanczos`)
  const z = zoomExpr(shot.motion, durationMs)
  if (z) {
    // The crop's offsets come from the same expression as the scale: crop
    // reads its input's size once, so a bare crop would zoom to a corner.
    const w = `2*trunc(${box.width}*${z}/2)`
    const h = `2*trunc(${box.height}*${z}/2)`
    parts.push(
      `scale=w='${w}':h='${h}':eval=frame:flags=lanczos`,
      `crop=${box.width}:${box.height}:x='(${w}-${box.width})/2':y='(${h}-${box.height})/2'`
    )
  }
  parts.push("setsar=1")
  return parts.filter(Boolean).join(",")
}

const cover = (b: Box): string =>
  `scale=${b.width}:${b.height}:force_original_aspect_ratio=increase:flags=lanczos,crop=${b.width}:${b.height},setsar=1`

/** A scene and where it sits. */
export type Scene = { readonly shot: ResolvedShot; readonly placed: Placed }

/** One scene, picture only, to `out`: exactly `placed.frames` frames. */
export function planSegment(
  { shot, placed }: Scene,
  series: Series,
  facts: Facts,
  out: string
): FfmpegCall {
  const { width, height, fps } = series.frame
  const frame = { width, height }
  const p = shot.shot.picture
  const inputs: Array<string> = []
  const filters: Array<string> = []
  const box = pictureBox(shot, series, facts)
  // The picture, when there is one, is input 0; the background follows it.
  let pic: string | null = null
  if (p.kind === "capture") {
    inputs.push("-ss", sec(p.inMs), "-i", p.source)
    pic = "0:v"
  } else if (p.kind === "still") {
    inputs.push("-loop", "1", "-framerate", String(fps), "-i", p.source)
    pic = "0:v"
  }
  const bgIn = pic ? 1 : 0
  const bg = shot.background
  switch (bg.kind) {
    case "as-captured": {
      inputs.push(
        "-f",
        "lavfi",
        "-i",
        `color=c=${series.ground}:s=${width}x${height}:r=${fps}`
      )
      filters.push(`[${bgIn}:v]setsar=1[bg]`)
      break
    }
    case "image": {
      inputs.push("-loop", "1", "-framerate", String(fps), "-i", bg.image.file)
      filters.push(`[${bgIn}:v]fps=${fps},${cover(frame)}[bg]`)
      break
    }
    case "blurred": {
      break
    }
    default: {
      assertNever(bg)
    }
  }
  if (pic) {
    const timed = timeChain(shot, fps, placed.frames)
    if (bg.kind === "blurred") {
      filters.push(
        `[${pic}]${timed},split=2[src][blur]`,
        `[blur]${cover(frame)},gblur=sigma=40[bg]`
      )
    } else {
      filters.push(`[${pic}]${timed}[src]`)
    }
    const x = series.window.x + (series.window.width - box.width) / 2
    const y = series.window.y + (series.window.height - box.height) / 2
    filters.push(
      `[src]${spaceChain(shot, series, facts, box, placed.frames)}[pic]`,
      `[bg][pic]overlay=x=${x}:y=${y},format=yuv420p[v]`
    )
  } else {
    filters.push(`[bg]format=yuv420p[v]`)
  }
  return {
    args: [
      ...QUIET,
      ...inputs,
      "-filter_complex",
      filters.join(";"),
      "-map",
      "[v]",
      "-frames:v",
      String(placed.frames),
      "-r",
      String(fps),
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "8",
      ...BITEXACT,
      out,
    ],
  }
}

/** A take placed in the video: its file, its trim, and where it starts. */
export type PlacedTake = {
  readonly file: string
  readonly inMs: number
  readonly outMs: number
  readonly atMs: number
}

export function placeTakes(
  scenes: ReadonlyArray<Scene>,
  fps: number
): ReadonlyArray<PlacedTake> {
  return scenes.flatMap(({ shot, placed }) => {
    const take = shot.shot.take
    if (!take) return []
    return [
      {
        file: take.file,
        inMs: take.inMs,
        outMs: take.outMs,
        atMs: toMs(placed.startFrame, fps) + shot.shot.voiceInMs,
      },
    ]
  })
}

/** Every take on one mono track, high-passed, the video's length. */
export function planVoice(
  takes: ReadonlyArray<PlacedTake>,
  totalMs: number,
  out: string
): FfmpegCall | null {
  if (!takes.length) return null
  const inputs = takes.flatMap((t) => ["-i", t.file])
  const chains = takes.map((t, i) => {
    const len = (t.outMs - t.inMs) / 1000
    return (
      `[${i}:a]atrim=start=${sec(t.inMs)}:end=${sec(t.outMs)},asetpts=PTS-STARTPTS,` +
      `${MONO},afade=t=in:d=0.03,afade=t=out:st=${Math.max(0, len - 0.08).toFixed(6)}:d=0.08,` +
      `adelay=${t.atMs}:all=1[t${i}]`
    )
  })
  const mix =
    `${takes
      .map((_, i) => `[t${i}]`)
      .join(
        ""
      )}amix=inputs=${takes.length}:normalize=0:duration=longest,highpass=f=70,` +
    `apad=whole_dur=${sec(totalMs)},atrim=duration=${sec(totalMs)}[o]`
  return {
    args: [
      ...QUIET,
      ...inputs,
      "-filter_complex",
      [...chains, mix].join(";"),
      "-map",
      "[o]",
      "-ac",
      "1",
      "-c:a",
      "pcm_s16le",
      ...BITEXACT,
      out,
    ],
  }
}

export const LOUDNESS = "I=-16:TP=-1.5:LRA=11"

/** The measuring pass: ffmpeg prints the voice's loudness as JSON. */
export function planMeasure(voice: string): FfmpegCall {
  return {
    args: [
      "-hide_banner",
      "-nostdin",
      "-i",
      voice,
      "-af",
      `loudnorm=${LOUDNESS}:print_format=json`,
      "-f",
      "null",
      "-",
    ],
  }
}

export type Loudness = {
  readonly input_i: string
  readonly input_tp: string
  readonly input_lra: string
  readonly input_thresh: string
  readonly target_offset: string
}

/** The last JSON object ffmpeg printed, or null when it printed none. */
export function readLoudness(stderr: string): Loudness | null {
  const start = stderr.lastIndexOf("{")
  const end = stderr.lastIndexOf("}")
  if (start < 0 || end < start) return null
  try {
    const j: unknown = JSON.parse(stderr.slice(start, end + 1))
    if (typeof j !== "object" || j === null) return null
    const get = (k: string): string | null => {
      const v: unknown = Reflect.get(j, k)
      return typeof v === "string" ? v : null
    }
    const input_i = get("input_i")
    const input_tp = get("input_tp")
    const input_lra = get("input_lra")
    const input_thresh = get("input_thresh")
    const target_offset = get("target_offset")
    if (!input_i || !input_tp || !input_lra || !input_thresh || !target_offset)
      return null
    return { input_i, input_tp, input_lra, input_thresh, target_offset }
  } catch {
    return null
  }
}

/** A burn-in, recorded with transparency, and the frame it starts on. */
export type Layer = { readonly file: string; readonly startFrame: number }

/** A sound cue placed in the video. */
export type PlacedCue = { readonly file: string; readonly atMs: number }

/** What the sound step mixes. */
export type Mix = {
  readonly totalFrames: number
  /** The voice track and its measured loudness; null loudness is silence. */
  readonly voice: {
    readonly file: string
    readonly loudness: Loudness | null
  } | null
  readonly music: MusicMode
  readonly cues: ReadonlyArray<PlacedCue>
}

/** What the last step joins: the segments, the burn-ins, the mixed sound. */
export type Assembly = {
  readonly scenes: ReadonlyArray<Scene>
  readonly segments: ReadonlyArray<string>
  readonly totalFrames: number
  readonly layers: ReadonlyArray<Layer>
  readonly mix: string
}

/** Where each scene's cues land, and which kit file sounds them. */
export function placeCues(
  scenes: ReadonlyArray<Scene>,
  series: Series
): ReadonlyArray<PlacedCue> {
  const fps = series.frame.fps
  return scenes.flatMap(({ shot, placed }) =>
    shot.cues.flatMap((c) => {
      const kit = series.sounds[c.sound]
      return kit
        ? [{ file: kit.file, atMs: toMs(placed.startFrame, fps) + c.atMs }]
        : []
    })
  )
}

/** The bed's level and how hard the voice pushes it down, per mode. */
const BED: Readonly<
  Record<Exclude<MusicMode, "off">, { lift: number; ratio: number }>
> = {
  "under-voice": { lift: 0, ratio: 6 },
  "up-between-lines": { lift: 6, ratio: 14 },
}

/** Joins the segments, lays the burn-ins on, mixes the sound, to `out`. */
/**
 * The sound: the levelled voice, the music bed lowered under it, and the
 * sound cues, the video's length, to a WAV. Its own step, so its bytes
 * are checked apart from the picture's.
 */
export function planMix(a: Mix, series: Series, out: string): FfmpegCall {
  const total = at(a.totalFrames, series.frame.fps)
  const inputs: Array<string> = []
  const filters: Array<string> = []
  const mix: Array<string> = []
  let next = 0
  let voiceKey: string | null = null
  if (a.voice) {
    inputs.push("-i", a.voice.file)
    const l = a.voice.loudness
    const level = l
      ? `loudnorm=${LOUDNESS}:measured_I=${l.input_i}:measured_TP=${l.input_tp}:` +
        `measured_LRA=${l.input_lra}:measured_thresh=${l.input_thresh}:offset=${l.target_offset}:linear=true,`
      : ""
    filters.push(`[${next++}:a]${level}${MONO},asplit=2[voice][key]`)
    mix.push("[voice]")
    voiceKey = "[key]"
  }
  if (a.music !== "off" && series.music) {
    const bed = BED[a.music]
    inputs.push("-stream_loop", "-1", "-i", series.music.bed.file)
    const level = `${MONO},atrim=duration=${total},volume=${series.music.gainDb + bed.lift}dB`
    if (voiceKey) {
      filters.push(
        `[${next++}:a]${level}[bed0]`,
        `[bed0]${voiceKey}sidechaincompress=threshold=0.02:ratio=${bed.ratio}:attack=20:release=400[bed]`
      )
    } else {
      filters.push(`[${next++}:a]${level}[bed]`)
    }
    mix.push("[bed]")
  } else if (voiceKey) {
    filters.push(`${voiceKey}anullsink`)
  }
  a.cues.forEach((c, i) => {
    inputs.push("-i", c.file)
    filters.push(
      `[${next++}:a]${MONO},` +
        `adelay=${c.atMs}:all=1,volume=${series.soundGainDb}dB[c${i}]`
    )
    mix.push(`[c${i}]`)
  })
  const tail = `apad=whole_dur=${total},atrim=duration=${total},aformat=sample_fmts=s16:sample_rates=48000:channel_layouts=stereo[a]`
  if (mix.length) {
    filters.push(
      `${mix.join("")}amix=inputs=${mix.length}:normalize=0:duration=longest,${tail}`
    )
  } else {
    inputs.push("-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono")
    filters.push(`[${next++}:a]${tail}`)
  }
  return {
    args: [
      ...QUIET,
      ...inputs,
      "-filter_complex",
      filters.join(";"),
      "-map",
      "[a]",
      "-c:a",
      "pcm_s16le",
      ...BITEXACT,
      out,
    ],
  }
}

/** Joins the segments, lays the burn-ins on, adds the mixed sound, to `out`. */
export function planAssembly(
  a: Assembly,
  series: Series,
  out: string
): FfmpegCall {
  const fps = series.frame.fps
  const inputs: Array<string> = []
  const filters: Array<string> = []
  let next = 0
  const segIn = a.segments.map((file) => {
    inputs.push("-i", file)
    return next++
  })
  segIn.forEach((n, i) =>
    filters.push(`[${n}:v]settb=AVTB,setpts=PTS-STARTPTS[s${i}]`)
  )
  let acc = "[s0]"
  a.scenes.forEach(({ shot: s, placed: p }, i) => {
    if (i === 0) return
    const label = `[j${i}]`
    if (s.transitionIn === "cut") {
      filters.push(`${acc}[s${i}]concat=n=2:v=1:a=0${label}`)
    } else {
      filters.push(
        `${acc}[s${i}]xfade=transition=${XFADE[s.transitionIn]}:` +
          `duration=${at(p.overlapFrames, fps)}:offset=${at(p.startFrame, fps)}${label}`
      )
    }
    acc = label
  })
  a.layers.forEach((layer, i) => {
    inputs.push("-i", layer.file)
    filters.push(
      `[${next++}:v]setpts=PTS-STARTPTS+${at(layer.startFrame, fps)}/TB[b${i}]`,
      `${acc}[b${i}]overlay=0:0:eof_action=pass[l${i}]`
    )
    acc = `[l${i}]`
  })
  filters.push(`${acc}format=yuv420p[v]`)
  inputs.push("-i", a.mix)
  return {
    args: [
      ...QUIET,
      ...inputs,
      "-filter_complex",
      filters.join(";"),
      "-map",
      "[v]",
      "-map",
      `${next}:a`,
      "-frames:v",
      String(a.totalFrames),
      "-r",
      String(fps),
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "160k",
      "-movflags",
      "+faststart",
      ...BITEXACT,
      out,
    ],
  }
}
