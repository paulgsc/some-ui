/**
 * Renders a cut list through ports, so the same runtime runs in a session,
 * in a test, and on home (GWB10). Every reason a video can't be rendered as
 * written (the cut list, the series, a missing, short or changed file) is
 * found before ffmpeg runs; a failure after that is ffmpeg's own, reported
 * with its last lines.
 */

import { sha256Hex } from "@some-ui/core-utils"

import { authorshipParams } from "./authorship"
import { isAuthorship, isCaptions, isComposition } from "./cut-list"
import type { BurnIn, Composition, CutList, Parsed } from "./cut-list"
import {
  batches,
  JOIN_BATCH,
  partScene,
  placeCues,
  placeTakes,
  planAssembly,
  planBed,
  planCompositionSegment,
  planJoin,
  planLevel,
  planMeasure,
  planMix,
  planSegment,
  planVoice,
  readLoudness,
} from "./plan"
import type { FfmpegCall, Layer, Scene, SourceFacts } from "./plan"
import { DEFAULT_POLICY, overLength, overSize } from "./policy"
import type { RenderPolicy } from "./policy"
import { designOf, resolve } from "./resolve"
import type { ResolvedShot } from "./resolve"
import { reviewOf } from "./review"
import { withSeries } from "./series"
import type { Series } from "./series"
import { lineCharsFor, subtitleLines, subtitlesAss } from "./subtitles"
import type { TimedWord } from "./subtitles"
import { place, shotTimes, toMs } from "./timing"
import type { Placement, ShotTime } from "./timing"
import type { CheckedFile, MusicMode } from "./vocabulary"

/** A burn-in the renderer asks to have recorded, and where it goes. */
export type BurnInRequest = BurnIn & {
  /** The design it is drawn in, its own or its series version's. */
  readonly design: string
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
  /** A file's size in bytes, or null when it is missing. */
  readonly fileBytes?: (file: string) => Promise<number | null>
  /** Removes a file, when it is there. */
  readonly remove?: (file: string) => Promise<void>
  /** Records one burn-in with transparency (ST15's stage), when one can. */
  readonly recordBurnIn?: (request: BurnInRequest) => Promise<boolean>
  /** The burn-ins that would clash, said before any is recorded; empty when none would. */
  readonly checkBurnIns?: (
    requests: ReadonlyArray<BurnInRequest>
  ) => Promise<ReadonlyArray<string>>
  /** Draws a composition scene's picture (HYPER2), when one can. */
  readonly compositions?: Compositions
}

/** A composition scene's picture to draw: the whole frame, as long as the scene. */
export type CompositionRequest = Omit<Composition, "kind"> & {
  readonly scene: string
  readonly frames: number
  readonly frame: Series["frame"]
  /** Where the clip is to be written, relative to the video's folder. */
  readonly out: string
}

export type Compositions = {
  /** Draws `request` to its `out`, or says why it could not. */
  readonly record: (
    request: CompositionRequest
  ) => Promise<
    { readonly ok: true } | { readonly ok: false; readonly problem: string }
  >
  /**
   * What decides a composition's bytes besides the request: its files, its
   * renderer's pin. A clip is kept in the step cache under it.
   */
  readonly pin: (ref: string) => Promise<string>
}

export type RenderOptions = {
  /** Where segments and the voice track go, relative to the video's folder. */
  readonly workDir: string
  /**
   * The video, relative to the video's folder. `shot-times.json` goes
   * beside it, and `review.json` when the cut list names its revision.
   */
  readonly out: string
  /**
   * When nothing records burn-ins, render without them and list them,
   * instead of refusing. With a recorder, every burn-in is drawn.
   */
  readonly withoutBurnIns?: boolean
  /** What the video may take (`RenderPolicy`); the defaults when unset. */
  readonly policy?: RenderPolicy
}

export type Rendered = Parsed<{
  readonly video: string
  readonly shotTimes: ReadonlyArray<ShotTime>
  readonly shotTimesFile: string
  /** Burn-ins left out because nothing could record them. */
  readonly leftOut: ReadonlyArray<
    Pick<BurnInRequest, "kind" | "design" | "params">
  >
}>

/**
 * The words of a scene's take that are heard, those inside its trim, in ms
 * from the scene's start: where the take is placed in it.
 */
function heardWords(shot: ResolvedShot): ReadonlyArray<TimedWord> {
  const take = shot.shot.take
  if (!take?.words) return []
  const atMs = shot.shot.voiceInMs
  // A word the trim cuts into keeps the part of it that is heard.
  return take.words
    .filter((w) => w.endMs > take.inMs && w.startMs < take.outMs)
    .map((w) => ({
      text: w.text,
      startMs: atMs + Math.max(w.startMs, take.inMs) - take.inMs,
      endMs: atMs + Math.min(w.endMs, take.outMs) - take.inMs,
    }))
}

/** Every word said in the video, when it is said. */
function wordsSaid(
  scenes: ReadonlyArray<Scene>,
  fps: number
): ReadonlyArray<TimedWord> {
  return scenes.flatMap(({ shot, placed }) => {
    const fromMs = toMs(placed.startFrame, fps)
    return heardWords(shot).map((w) => ({
      ...w,
      startMs: fromMs + w.startMs,
      endMs: fromMs + w.endMs,
    }))
  })
}

/** A word that ends a sentence ends the speaker's line. */
const SENTENCE_END = /[.?!]["')\]]*$/

/**
 * Words as the speaker's lines (`@some-ui/burn-ins`' captions params): a
 * line ends with a sentence, and a caption never spans two.
 */
function spokenLines(
  words: ReadonlyArray<TimedWord>
): ReadonlyArray<{ readonly words: ReadonlyArray<TimedWord> }> {
  const lines: Array<{ words: Array<TimedWord> }> = []
  let line: Array<TimedWord> = []
  for (const word of words) {
    line.push(word)
    if (SENTENCE_END.test(word.text)) {
      lines.push({ words: line })
      line = []
    }
  }
  if (line.length > 0) lines.push({ words: line })
  return lines
}

const refused = (problems: ReadonlyArray<string>): Rendered => ({
  ok: false,
  problems,
})

const dirOf = (file: string): string =>
  file.includes("/") ? file.slice(0, file.lastIndexOf("/")) : "."

const tail = (stderr: string): string =>
  stderr.trim().split("\n").slice(-6).join("\n") || "ffmpeg gave no reason"

export async function render(
  own: CutList,
  series: Series,
  ports: Ports,
  options: RenderOptions
): Promise<Rendered> {
  // The video as drawn: its own scenes and the series' intro and outro.
  const framed = withSeries(own, series)
  if (!framed.ok) return refused(framed.problems)
  const cutList = framed.value
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
  // Policy, before anything is drawn: a video past its length is refused.
  const policy = options.policy ?? DEFAULT_POLICY
  const tooLong = overLength(toMs(totalFrames, fps), policy)
  if (tooLong) return refused([tooLong])
  const scenes: ReadonlyArray<Scene> = shots.map((shot, i) => {
    const placed = placement.value.shots[i]
    if (!placed) throw new Error(`${shot.shot.id} was not placed`)
    return { shot, placed }
  })

  const checked = await checkInputs(series, shots, music, ports)
  if (!checked.ok) return refused(checked.problems)
  const draw = ports.compositions
  if (!draw && shots.some((s) => isComposition(s.shot))) {
    return refused(["nothing here can draw a composition"])
  }

  const work = options.workDir
  const layered = burnInRequests(cutList, placement.value, series, work)
  const captions = captionRequests(
    cutList,
    scenes,
    placement.value,
    series,
    work
  )
  const requests = [...layered, ...captions.map((c) => c.request)]
  if (requests.length && !ports.recordBurnIn && !options.withoutBurnIns) {
    return refused([
      "nothing here can draw burn-ins; render with them left out, or with " +
        "them drawn by `pnpm --filter www record:short`",
    ])
  }
  if (ports.recordBurnIn && ports.checkBurnIns && requests.length > 1) {
    const clashing = await ports.checkBurnIns(requests)
    if (clashing.length > 0) return refused(clashing)
  }
  await ports.mkdir(work)
  await ports.mkdir(dirOf(options.out))

  // With nothing to record them, every burn-in is left out, and listed.
  const record = ports.recordBurnIn
  const leftOut = record
    ? []
    : requests.map(({ kind, design, params }) => ({ kind, design, params }))
  const notRecorded = (r: BurnInRequest): Rendered =>
    refused([`the ${r.kind} burn-in (${r.design}) did not record`])

  const layers: Array<Layer> = []
  if (record) {
    for (const r of layered) {
      if (!(await record(r))) return notRecorded(r)
      layers.push({ file: r.out, startFrame: r.startFrame })
    }
  }

  // Each scene's captions, recorded just before its segment (`captionRequests`).
  const captionOf = new Map(captions.map((c) => [c.scene, c.request]))
  const segments: Array<string> = []
  for (const scene of scenes) {
    const id = scene.shot.shot.id
    const caption = record && captionOf.get(id)
    if (caption && !(await record(caption))) return notRecorded(caption)
    const out = `${work}/${id}.mkv`
    const layer = caption ? caption.out : undefined
    const p = scene.shot.shot.picture
    let call: FfmpegCall
    if (p.kind === "composition" && draw) {
      const clip = `${work}/composition-${id}.mkv`
      const drawn = await draw.record({
        scene: id,
        ref: p.ref,
        variables: p.variables,
        files: p.files,
        frames: scene.placed.frames,
        frame: series.frame,
        out: clip,
      })
      if (!drawn.ok) return refused([`${id}: ${drawn.problem}`])
      call = planCompositionSegment(scene, series, clip, out, layer)
    } else {
      call = planSegment(scene, series, checked.value, out, layer)
    }
    const ran = await ports.ffmpeg(call)
    if (!ran.ok) return refused([`${id}: ${tail(ran.stderr)}`])
    segments.push(out)
  }

  const voiceFile = `${work}/voice.wav`
  const takes = placeTakes(scenes, fps)
  const voiceCall = planVoice(takes, toMs(totalFrames, fps), voiceFile)
  let voice: string | null = null
  if (voiceCall) {
    const ran = await ports.ffmpeg(voiceCall)
    if (!ran.ok) return refused([`the voice: ${tail(ran.stderr)}`])
    const measured = await ports.ffmpeg(planMeasure(voiceFile))
    if (!measured.ok) {
      return refused([`the voice's level: ${tail(measured.stderr)}`])
    }
    const loudness = readLoudness(measured.stderr)
    voice = voiceFile
    // A silent track has no loudness to bring to -16 LUFS.
    if (loudness && Number.isFinite(Number(loudness.input_i))) {
      voice = `${work}/voice-level.wav`
      const levelled = await ports.ffmpeg(planLevel(voiceFile, loudness, voice))
      if (!levelled.ok) {
        return refused([`the voice's level: ${tail(levelled.stderr)}`])
      }
    }
  }

  let bed: string | null = null
  const bedCall =
    music === "off"
      ? null
      : planBed(music, takes, totalFrames, series, `${work}/bed.wav`)
  if (bedCall) {
    const ran = await ports.ffmpeg(bedCall)
    if (!ran.ok) return refused([`the music bed: ${tail(ran.stderr)}`])
    bed = `${work}/bed.wav`
  }

  const mixFile = `${work}/mix.wav`
  const mixed = await ports.ffmpeg(
    planMix(
      { totalFrames, voice, bed, cues: placeCues(scenes, series) },
      series,
      mixFile
    )
  )
  if (!mixed.ok) return refused([`the sound: ${tail(mixed.stderr)}`])

  // VR1: past JOIN_BATCH scenes, the segments are joined a batch at a time
  // into parts, and the parts are what the last step joins, so no ffmpeg
  // call holds every scene of a long video at once.
  let joined: {
    scenes: ReadonlyArray<Scene>
    segments: ReadonlyArray<string>
  } = { scenes, segments }
  if (scenes.length > JOIN_BATCH) {
    const sceneParts = batches(scenes)
    const segmentParts = batches(segments)
    // Their own folder: a shot's id never holds a slash, so no scene's
    // segment (`${work}/<id>.mkv`) can be a part, however a shot is named.
    const partsDir = `${work}/parts`
    await ports.mkdir(partsDir)
    const parts: Array<string> = []
    const partScenes: Array<Scene> = []
    for (const [k, part] of sceneParts.entries()) {
      const file = `${partsDir}/${k + 1}.mkv`
      const ran = await ports.ffmpeg(
        planJoin(part, segmentParts[k] ?? [], series, file)
      )
      if (!ran.ok) {
        return refused([`part ${k + 1} of the video: ${tail(ran.stderr)}`])
      }
      parts.push(file)
      partScenes.push(partScene(part, k + 1))
    }
    joined = { scenes: partScenes, segments: parts }
  }

  // Subtitles, from each take's words where its cut list asks for them. The
  // script is named by its sum, so a cached last step never draws old words.
  let subtitles: string | undefined
  const said = wordsSaid(scenes, fps)
  if (cutList.subtitles && said.length > 0) {
    const script = subtitlesAss(
      subtitleLines(said, lineCharsFor(series.frame)),
      series.frame,
      cutList.subtitles
    )
    subtitles = `${work}/subtitles-${(await sha256Hex(script)).slice(0, 16)}.ass`
    await ports.writeFile(subtitles, script)
  }

  const assembled = await ports.ffmpeg(
    planAssembly(
      {
        ...joined,
        totalFrames,
        layers,
        mix: mixFile,
        ...(subtitles === undefined ? {} : { subtitles }),
      },
      series,
      options.out
    )
  )
  if (!assembled.ok) return refused([`the video: ${tail(assembled.stderr)}`])
  // Policy, once it is made: a video past its size is removed and refused.
  const bytes = ports.fileBytes ? await ports.fileBytes(options.out) : null
  const tooBig = bytes === null ? null : overSize(bytes, policy)
  if (tooBig) {
    await ports.remove?.(options.out)
    return refused([tooBig])
  }

  const times = shotTimes(placement.value.shots, fps)
  const shotTimesFile = `${dirOf(options.out)}/shot-times.json`
  await ports.writeFile(shotTimesFile, `${JSON.stringify(times, null, 1)}\n`)
  // A note is pinned to the video's own scenes, never to the series'.
  const ids = new Set(own.shots.map((s) => s.id))
  const review = reviewOf(
    own,
    times.filter((t) => ids.has(t.id))
  )
  if (review !== null)
    await ports.writeFile(
      `${dirOf(options.out)}/review.json`,
      `${JSON.stringify(review, null, 1)}\n`
    )
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
    if (p.kind === "composition") {
      for (const file of p.files) {
        if ((await ports.sha256(file)) === null) {
          problems.push(`${shot.id}: ${file} is missing`)
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
  for (const [what, scene] of [
    ["the series' intro", series.intro],
    ["the series' outro", series.outro],
  ] as const) {
    if (scene?.picture.kind === "still") {
      await unchanged(what, scene.picture.image)
    }
  }
  return problems.length ? { ok: false, problems } : { ok: true, value: facts }
}

/** The design a burn-in is drawn in, its own or its series'. */
function design(b: BurnIn, series: Series): string {
  const d = designOf(b, series)
  // `resolve` refuses a burn-in with no design before this runs.
  if (d === null) throw new Error(`the ${b.kind} burn-in has no design`)
  return d
}

/**
 * How many frames scene `i`'s burn-ins last: until the next scene starts, so
 * during a transition one scene's and the next one's are never both up.
 */
const framesUntilNext = (placement: Placement, i: number): number => {
  const at = placement.shots[i]
  if (!at) throw new Error(`scene ${i} was not placed`)
  return (
    (placement.shots[i + 1]?.startFrame ?? placement.totalFrames) -
    at.startFrame
  )
}

/** The burn-ins to record: the video's over its length, each scene's over it. */
function burnInRequests(
  cutList: CutList,
  placement: Placement,
  series: Series,
  work: string
): ReadonlyArray<BurnInRequest> {
  // Captions are recorded a scene at a time (`captionRequests`).
  const whole = cutList.burnIns.flatMap((b, i) =>
    isCaptions(b)
      ? []
      : [
          {
            ...b,
            design: design(b, series),
            // The authorship mark is drawn from the scenes, never from what was
            // written for it (`parseCutList` refuses any).
            params: isAuthorship(b)
              ? authorshipParams(cutList, placement, series.frame.fps)
              : b.params,
            startFrame: 0,
            frames: placement.totalFrames,
            frame: series.frame,
            out: `${work}/burn-in-${i}-${b.kind}.mov`,
          },
        ]
  )
  const perShot = cutList.shots.flatMap((s, i) => {
    const at = placement.shots[i]
    if (!at) throw new Error(`${s.id} was not placed`)
    return s.burnIns.map((b, k) => ({
      ...b,
      design: design(b, series),
      startFrame: at.startFrame,
      frames: framesUntilNext(placement, i),
      frame: series.frame,
      out: `${work}/burn-in-${s.id}-${k}-${b.kind}.mov`,
    }))
  })
  return [...whole, ...perShot]
}

/**
 * Each scene's captions, when the video asks for them (SFEED11): the words
 * heard in its take, in its own time, recorded on their own and laid over
 * the scene's segment, so no step holds more than one scene's frames. A
 * scene with nothing said has none.
 */
function captionRequests(
  cutList: CutList,
  scenes: ReadonlyArray<Scene>,
  placement: Placement,
  series: Series,
  work: string
): ReadonlyArray<{ readonly scene: string; readonly request: BurnInRequest }> {
  const asked = cutList.burnIns.find(isCaptions)
  if (!asked) return []
  return scenes.flatMap(({ shot, placed }, i) => {
    const words = heardWords(shot)
    if (words.length === 0) return []
    const id = shot.shot.id
    return [
      {
        scene: id,
        request: {
          kind: asked.kind,
          design: design(asked, series),
          params: { lines: spokenLines(words) },
          startFrame: placed.startFrame,
          frames: framesUntilNext(placement, i),
          frame: series.frame,
          out: `${work}/burn-in-${id}-captions.mov`,
        },
      },
    ]
  })
}
