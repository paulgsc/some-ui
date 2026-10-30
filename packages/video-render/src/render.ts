/**
 * Renders a cut list: checks everything it reads first, then runs the calls
 * `plan.ts` writes, through ports, so the same runtime runs in a session, in
 * a test, and on home (GWB10). A video that can't be rendered as written is
 * refused whole, with every reason, before anything is made.
 *
 * Paths are relative to the video's folder; the ports resolve them.
 */

import type { BurnIn, CutList } from "./cut-list"
import {
  placeCues,
  placeTakes,
  planAssembly,
  planMeasure,
  planSegment,
  planVoice,
  readLoudness,
} from "./plan"
import type { Assembly, FfmpegCall, Layer, SourceFacts } from "./plan"
import { resolve } from "./resolve"
import type { ResolvedShot } from "./resolve"
import type { Series } from "./series"
import { place, shotTimes, toMs } from "./timing"
import type { Placement, ShotTime } from "./timing"
import type { CheckedFile, MusicMode } from "./vocabulary"

/** A burn-in the renderer asks to have recorded, and where it goes. */
export type BurnInRequest = BurnIn & {
  readonly startFrame: number
  readonly frames: number
  readonly frame: Series["frame"]
  /** Where the recording is to be written, relative to the video's folder. */
  readonly out: string
}

export type Ports = {
  /** Runs ffmpeg in the video's folder. */
  readonly ffmpeg: (
    call: FfmpegCall
  ) => Promise<{ readonly ok: boolean; readonly stderr: string }>
  /** What a file is, or null when it is missing or unreadable. */
  readonly probe: (file: string) => Promise<SourceFacts | null>
  readonly sha256: (file: string) => Promise<string | null>
  readonly mkdir: (dir: string) => Promise<void>
  readonly writeFile: (file: string, text: string) => Promise<void>
  /**
   * Records one burn-in with transparency (STUDIO ST15's stage). Absent
   * until that workspace lands.
   */
  readonly recordBurnIn?: (request: BurnInRequest) => Promise<boolean>
}

export type RenderOptions = {
  /** Where segments and the voice track go, relative to the video's folder. */
  readonly workDir: string
  /** The video, relative to the video's folder. `shot-times.json` goes beside it. */
  readonly out: string
  /**
   * Render without burn-ins when nothing can record them yet. What was left
   * out is listed in the result, never dropped silently.
   */
  readonly withoutBurnIns?: boolean
}

export type Rendered =
  | {
      readonly ok: true
      readonly video: string
      readonly shotTimes: ReadonlyArray<ShotTime>
      readonly shotTimesFile: string
      /** Burn-ins left out because nothing could record them. */
      readonly leftOut: ReadonlyArray<BurnIn>
    }
  | { readonly ok: false; readonly problems: ReadonlyArray<string> }

const refused = (problems: ReadonlyArray<string>): Rendered => ({
  ok: false,
  problems,
})

const dirOf = (file: string): string =>
  file.includes("/") ? file.slice(0, file.lastIndexOf("/")) : "."

const tail = (stderr: string): string =>
  stderr.trim().split("\n").slice(-6).join("\n")

export async function render(
  cutList: CutList,
  series: Series,
  ports: Ports,
  options: RenderOptions
): Promise<Rendered> {
  const resolved = resolve(cutList, series)
  if (!resolved.ok) return refused(resolved.problems)
  const fps = series.frame.fps
  const placement = place(
    resolved.shots.map((s) => ({
      id: s.shot.id,
      cut: s.shot.cut,
      durationMs: s.shot.durationMs,
      transitionIn: s.transitionIn,
    })),
    fps
  )
  if (!placement.ok) return refused(placement.problems)

  const checked = await checkInputs(
    series,
    resolved.shots,
    resolved.music,
    ports
  )
  if (!checked.ok) return refused(checked.problems)

  const work = options.workDir
  await ports.mkdir(work)
  await ports.mkdir(dirOf(options.out))

  const layers: Array<Layer> = []
  const leftOut: Array<BurnIn> = []
  const requests = burnInRequests(cutList, placement, series, work)
  if (requests.length && !ports.recordBurnIn && !options.withoutBurnIns) {
    return refused([
      "burn-ins can't be drawn yet: nothing records them (STUDIO ST15), " +
        "and the render was not asked to leave them out",
    ])
  }
  for (const r of requests) {
    if (!ports.recordBurnIn) {
      leftOut.push({ kind: r.kind, design: r.design, params: r.params })
      continue
    }
    if (!(await ports.recordBurnIn(r))) {
      return refused([`the ${r.kind} burn-in (${r.design}) did not record`])
    }
    layers.push({ file: r.out, startFrame: r.startFrame })
  }

  const segments: Array<string> = []
  for (const [i, shot] of resolved.shots.entries()) {
    const placed = placement.shots[i]
    if (!placed) continue
    const out = `${work}/${shot.shot.id}.mkv`
    const ran = await ports.ffmpeg(
      planSegment(shot, placed, series, checked.facts, out)
    )
    if (!ran.ok) return refused([`${shot.shot.id}: ${tail(ran.stderr)}`])
    segments.push(out)
  }

  const totalMs = toMs(placement.totalFrames, fps)
  const voiceFile = `${work}/voice.wav`
  const voiceCall = planVoice(
    placeTakes(resolved.shots, placement.shots, fps),
    totalMs,
    voiceFile
  )
  let voice: Assembly["voice"] = null
  if (voiceCall) {
    const ran = await ports.ffmpeg(voiceCall)
    if (!ran.ok) return refused([`the voice: ${tail(ran.stderr)}`])
    const measured = await ports.ffmpeg(planMeasure(voiceFile))
    if (!measured.ok)
      return refused([`the voice's level: ${tail(measured.stderr)}`])
    const loudness = readLoudness(measured.stderr)
    // A silent track has no loudness to bring to -16 LUFS.
    voice = {
      file: voiceFile,
      loudness:
        loudness && Number.isFinite(Number(loudness.input_i)) ? loudness : null,
    }
  }

  const assembled = await ports.ffmpeg(
    planAssembly(
      {
        shots: resolved.shots,
        placed: placement.shots,
        segments,
        totalFrames: placement.totalFrames,
        layers,
        voice,
        music: resolved.music,
        cues: placeCues(resolved.shots, placement.shots, series),
      },
      series,
      options.out
    )
  )
  if (!assembled.ok) return refused([`the video: ${tail(assembled.stderr)}`])

  const times = shotTimes(placement.shots, fps)
  const shotTimesFile = `${dirOf(options.out)}/shot-times.json`
  await ports.writeFile(shotTimesFile, `${JSON.stringify(times, null, 1)}\n`)
  return {
    ok: true,
    video: options.out,
    shotTimes: times,
    shotTimesFile,
    leftOut,
  }
}

type Checked =
  | { readonly ok: true; readonly facts: ReadonlyMap<string, SourceFacts> }
  | { readonly ok: false; readonly problems: ReadonlyArray<string> }

/** Every file the video reads exists, is long enough, and is unchanged. */
async function checkInputs(
  series: Series,
  shots: ReadonlyArray<ResolvedShot>,
  music: MusicMode,
  ports: Ports
): Promise<Checked> {
  const problems: Array<string> = []
  const facts = new Map<string, SourceFacts>()
  const read = async (file: string): Promise<SourceFacts | null> => {
    const known = facts.get(file)
    if (known) return known
    const f = await ports.probe(file)
    if (f) facts.set(file, f)
    return f
  }
  const unchanged = async (what: string, c: CheckedFile): Promise<void> => {
    const sum = await ports.sha256(c.file)
    if (sum === null) problems.push(`${what}: ${c.file} is missing`)
    else if (sum !== c.sha256) {
      problems.push(`${what}: ${c.file} changed since it was chosen`)
    }
  }
  for (const s of shots) {
    const shot = s.shot
    const p = shot.picture
    if (p.kind === "capture" || p.kind === "still") {
      const f = await read(p.source)
      if (!f) problems.push(`${shot.id}: ${p.source} is missing`)
      else if (p.kind === "capture") {
        // The source is read to its out, its freeze, or the scene's end,
        // whichever comes first; the last frame read holds after that.
        const freeze = s.motion.kind === "freeze" ? s.motion.atMs : Infinity
        const need = Math.min(
          p.outMs ?? Infinity,
          p.inMs + Math.min(freeze, shot.durationMs) * p.speed
        )
        if (f.durationMs + 50 < need) {
          problems.push(
            `${shot.id}: ${p.source} is too short (${need} ms needed)`
          )
        }
      }
    }
    if (shot.take) {
      const f = await read(shot.take.file)
      if (!f) problems.push(`${shot.id}: the take ${shot.take.file} is missing`)
      else if (f.durationMs + 50 < shot.take.outMs) {
        problems.push(`${shot.id}: the take ends before ${shot.take.outMs} ms`)
      }
    }
    if (s.background.kind === "image") {
      await unchanged(`${shot.id}'s background`, s.background.image)
    }
  }
  const sounds = new Set(shots.flatMap((s) => s.cues.map((c) => c.sound)))
  for (const sound of sounds) {
    const kit = series.sounds[sound]
    if (kit) await unchanged(`the ${sound} sound`, kit)
  }
  if (series.music && music !== "off") {
    await unchanged("the music bed", series.music.bed)
  }
  return problems.length ? { ok: false, problems } : { ok: true, facts }
}

/** The burn-ins to record: the video's over its length, each scene's over it. */
function burnInRequests(
  cutList: CutList,
  placement: Extract<Placement, { ok: true }>,
  series: Series,
  work: string
): ReadonlyArray<BurnInRequest> {
  const whole = cutList.burnIns.map((b, i) => ({
    ...b,
    startFrame: 0,
    frames: placement.totalFrames,
    frame: series.frame,
    out: `${work}/burn-in-${i}-${b.kind}.mov`,
  }))
  const perShot = cutList.shots.flatMap((s, i) => {
    const at = placement.shots[i]
    if (!at) return []
    return s.burnIns.map((b, k) => ({
      ...b,
      startFrame: at.startFrame,
      frames: at.frames,
      frame: series.frame,
      out: `${work}/burn-in-${s.id}-${k}-${b.kind}.mov`,
    }))
  })
  return [...whole, ...perShot]
}
