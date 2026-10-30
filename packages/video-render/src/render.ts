/**
 * Renders a cut list through ports, so the same runtime runs in a session,
 * in a test, and on home (GWB10). Every reason a video can't be rendered as
 * written (the cut list, the series, a missing, short or changed file) is
 * found before ffmpeg runs; a failure after that is ffmpeg's own, reported
 * with its last lines.
 */

import type { BurnIn, CutList, Parsed } from "./cut-list"
import {
  placeCues,
  placeTakes,
  planAssembly,
  planMeasure,
  planMix,
  planSegment,
  planVoice,
  readLoudness,
} from "./plan"
import type { FfmpegCall, Layer, Mix, Scene, SourceFacts } from "./plan"
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
  /** Records one burn-in with transparency (ST15's stage), when one can. */
  readonly recordBurnIn?: (request: BurnInRequest) => Promise<boolean>
}

export type RenderOptions = {
  /** Where segments and the voice track go, relative to the video's folder. */
  readonly workDir: string
  /** The video, relative to the video's folder. `shot-times.json` goes beside it. */
  readonly out: string
  /**
   * When nothing records burn-ins, render without them and list them,
   * instead of refusing. With a recorder, every burn-in is drawn.
   */
  readonly withoutBurnIns?: boolean
}

export type Rendered = Parsed<{
  readonly video: string
  readonly shotTimes: ReadonlyArray<ShotTime>
  readonly shotTimesFile: string
  /** Burn-ins left out because nothing could record them. */
  readonly leftOut: ReadonlyArray<BurnIn>
}>

const refused = (problems: ReadonlyArray<string>): Rendered => ({
  ok: false,
  problems,
})

const dirOf = (file: string): string =>
  file.includes("/") ? file.slice(0, file.lastIndexOf("/")) : "."

const tail = (stderr: string): string =>
  stderr.trim().split("\n").slice(-6).join("\n") || "ffmpeg gave no reason"

export async function render(
  cutList: CutList,
  series: Series,
  ports: Ports,
  options: RenderOptions
): Promise<Rendered> {
  const resolved = resolve(cutList, series)
  if (!resolved.ok) return refused(resolved.problems)
  const { shots, music } = resolved.value
  const fps = series.frame.fps
  const placement = place(
    shots.map((s) => ({
      id: s.shot.id,
      cut: s.shot.cut,
      durationMs: s.shot.durationMs,
      transitionIn: s.transitionIn,
      ...(s.shot.take
        ? {
            take: {
              atMs: s.shot.voiceInMs,
              lengthMs: s.shot.take.outMs - s.shot.take.inMs,
            },
          }
        : {}),
    })),
    fps
  )
  if (!placement.ok) return refused(placement.problems)
  const { totalFrames } = placement.value
  const scenes: ReadonlyArray<Scene> = shots.map((shot, i) => {
    const placed = placement.value.shots[i]
    if (!placed) throw new Error(`${shot.shot.id} was not placed`)
    return { shot, placed }
  })

  const checked = await checkInputs(series, shots, music, ports)
  if (!checked.ok) return refused(checked.problems)

  const work = options.workDir
  const requests = burnInRequests(cutList, placement.value, series, work)
  if (requests.length && !ports.recordBurnIn && !options.withoutBurnIns) {
    return refused([
      "nothing can draw burn-ins yet; render with them left out, or once " +
        "the burn-ins workspace lands",
    ])
  }
  await ports.mkdir(work)
  await ports.mkdir(dirOf(options.out))

  const layers: Array<Layer> = []
  const leftOut: Array<BurnIn> = []
  for (const r of requests) {
    if (!ports.recordBurnIn) {
      leftOut.push({ kind: r.kind, design: r.design, params: r.params })
    } else if (await ports.recordBurnIn(r)) {
      layers.push({ file: r.out, startFrame: r.startFrame })
    } else {
      return refused([`the ${r.kind} burn-in (${r.design}) did not record`])
    }
  }

  const segments: Array<string> = []
  for (const scene of scenes) {
    const out = `${work}/${scene.shot.shot.id}.mkv`
    const ran = await ports.ffmpeg(
      planSegment(scene, series, checked.value, out)
    )
    if (!ran.ok) return refused([`${scene.shot.shot.id}: ${tail(ran.stderr)}`])
    segments.push(out)
  }

  const voiceFile = `${work}/voice.wav`
  const voiceCall = planVoice(
    placeTakes(scenes, fps),
    toMs(totalFrames, fps),
    voiceFile
  )
  let voice: Mix["voice"] = null
  if (voiceCall) {
    const ran = await ports.ffmpeg(voiceCall)
    if (!ran.ok) return refused([`the voice: ${tail(ran.stderr)}`])
    const measured = await ports.ffmpeg(planMeasure(voiceFile))
    if (!measured.ok) {
      return refused([`the voice's level: ${tail(measured.stderr)}`])
    }
    const loudness = readLoudness(measured.stderr)
    // A silent track has no loudness to bring to -16 LUFS.
    voice = {
      file: voiceFile,
      loudness:
        loudness && Number.isFinite(Number(loudness.input_i)) ? loudness : null,
    }
  }

  const mixFile = `${work}/mix.wav`
  const mixed = await ports.ffmpeg(
    planMix(
      { totalFrames, voice, music, cues: placeCues(scenes, series) },
      series,
      mixFile
    )
  )
  if (!mixed.ok) return refused([`the sound: ${tail(mixed.stderr)}`])

  const assembled = await ports.ffmpeg(
    planAssembly(
      { scenes, segments, totalFrames, layers, mix: mixFile },
      series,
      options.out
    )
  )
  if (!assembled.ok) return refused([`the video: ${tail(assembled.stderr)}`])

  const times = shotTimes(placement.value.shots, fps)
  const shotTimesFile = `${dirOf(options.out)}/shot-times.json`
  await ports.writeFile(shotTimesFile, `${JSON.stringify(times, null, 1)}\n`)
  return {
    ok: true,
    value: { video: options.out, shotTimes: times, shotTimesFile, leftOut },
  }
}

/** Every file the video reads exists, is long enough, and is unchanged. */
async function checkInputs(
  series: Series,
  shots: ReadonlyArray<ResolvedShot>,
  music: MusicMode,
  ports: Ports
): Promise<Parsed<ReadonlyMap<string, SourceFacts>>> {
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
        // Read to its out, its freeze or the scene's end, whichever is first.
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
  return problems.length ? { ok: false, problems } : { ok: true, value: facts }
}

/** The burn-ins to record: the video's over its length, each scene's over it. */
function burnInRequests(
  cutList: CutList,
  placement: Placement,
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
    if (!at) throw new Error(`${s.id} was not placed`)
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
