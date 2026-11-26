/**
 * The owner's takes, conditioned (HOST12, #3554; epic #3521): what a long
 * take becomes before it plays as a conversation's turns. The owner: "we
 * need to synthesize the voice so that it's sped up ... and we remove the
 * silent moments. And also we raise the volume."
 *
 * Every decision here is a pure function of the take's samples and
 * `TAKE_POLICY`, so the same take gives the same cut, and the ffmpeg step
 * that plays it (`planCondition`) the same bytes:
 *
 * - **The speaking level** (`speakingDb`): how loud the owner's voice is in
 *   this take, a high percentile of its frames. What counts as voiced is
 *   measured from it, never a fixed floor, since the phone's mic opens on
 *   about a second of hiss.
 * - **The edge screener** (`screenEdges`): the click or thump of the record
 *   button at a take's start and end is found by its shape (a short,
 *   broadband burst near the edge with no voice close after or before it),
 *   and the take is bounded to its voiced frames, a short lead before the
 *   first and a tail after the last. No fixed cut: a word that starts early
 *   is voice, and is kept.
 * - **The noise floor**: what is left in a take's silences, measured, and a
 *   take above `noiseFloorMostDb` is flagged (`noisy`), never failed
 *   silently. The denoise pass is ffmpeg's, set from that floor.
 * - **The gaps** (`keptStretches`): every silence longer than `gapMostMs` is
 *   shortened to it from its middle, so each join lands in silence, faded.
 *   Cut on the waveform's own silences, not on the transcript's word
 *   boundaries, which clipped word endings ("choppy… it clips word
 *   endings").
 * - **Spans** (`spanProblems`): a turn cut from a long take says what its
 *   words say, and its edges fall between words.
 * - **Captions** (`retimed`): the transcript's words placed on the
 *   conditioned audio, through the same cut and tempo.
 */

import type { Parsed, TimedWord } from "./cut-list"
import {
  loudnessAt,
  planCondition,
  planLevel,
  planMeasure,
  readLoudness,
} from "./plan"
import type { Ports } from "./render"
import { samplesOf } from "./wav"

/**
 * How the owner's takes are conditioned: policy, moved with the story
 * (C771; C1549).
 */
export const TAKE_POLICY = {
  /** The analysis frame. */
  frameMs: 10,
  /**
   * How much faster a take plays, pitch kept: 1.2, as the owner approved
   * every take on the first real conversation ("use 1.2 for all my
   * voices"), moving the 1.5 first named.
   */
  tempo: 1.2,
  /** The loudness a take is brought to: the essay voice's. */
  loudnessLufs: -16,
  /** The longest silence kept between phrases: what worked in v5. */
  gapMostMs: 280,
  /** The fade at each join. */
  joinFadeMs: 10,
  /** What is kept before the first voiced frame: a turn starts within 0.1 s of its first word. */
  leadMs: 60,
  /** What is kept after the last voiced frame, for a word's decay. */
  tailMs: 120,
  /** The share of the speech-bearing frames the speaking level sits above. */
  speakingPercentile: 0.9,
  /** The share of all frames a take's quiet sits above. */
  quietPercentile: 0.2,
  /** How far over the take's quiet a frame bears speech, for the speaking level alone. */
  speechOverQuietDb: 15,
  /** How far under the speaking level a frame is still voiced. */
  voicedUnderSpeakingDb: 30,
  /** How near an edge a record button's transient lies. */
  edgeWindowMs: 300,
  /** The longest a transient lasts. */
  clickMostMs: 40,
  /** How much silence separates a transient from the voice. */
  clickGuardMs: 50,
  /** How broadband a transient is: its sample-to-sample energy over its energy (a voice's is far lower). */
  clickBroadband: 0.3,
  /** The loudest a take's silences may be before it is flagged. */
  noiseFloorMostDb: -50,
} as const

export type TakePolicy = { readonly [K in keyof typeof TAKE_POLICY]: number }

/** A stretch of a take, in ms from its start. */
export type Stretch = { readonly fromMs: number; readonly toMs: number }

/** One analysis frame: its level, and how broadband it is. */
export type TakeFrame = {
  readonly db: number
  readonly broadband: number
}

const SILENT_DB = -120

const dbOf = (meanSquare: number): number =>
  meanSquare > 0 ? Math.max(SILENT_DB, 10 * Math.log10(meanSquare)) : SILENT_DB

/** The take cut into frames of `frameMs`, each its level and broadband share. */
export function framesOf(
  samples: Float32Array,
  rate: number,
  frameMs: number = TAKE_POLICY.frameMs
): ReadonlyArray<TakeFrame> {
  const size = Math.max(1, Math.round((rate * frameMs) / 1000))
  const frames: Array<TakeFrame> = []
  for (let at = 0; at < samples.length; at += size) {
    const end = Math.min(samples.length, at + size)
    let energy = 0
    let change = 0
    for (let i = at; i < end; i++) {
      const x = samples[i] ?? 0
      energy += x * x
      const d = x - (samples[i - 1] ?? x)
      change += d * d
    }
    const n = end - at
    frames.push({
      db: dbOf(energy / n),
      broadband: energy > 0 ? change / energy : 0,
    })
  }
  return frames
}

/** The level a `share` of sorted `levels` sit under. */
const percentile = (levels: ReadonlyArray<number>, share: number): number =>
  levels[Math.min(levels.length - 1, Math.floor(share * levels.length))] ??
  SILENT_DB

/**
 * How loud the voice is in a take: the level `speakingPercentile` of its
 * speech-bearing frames sit under, those `speechOverQuietDb` over its quiet.
 * Measured over speech alone, so a short answer in a long, hissing take is
 * measured by its words, not by the hiss around them.
 */
export function speakingDb(
  frames: ReadonlyArray<TakeFrame>,
  policy: TakePolicy = TAKE_POLICY
): number {
  const levels = frames.map((f) => f.db).sort((a, b) => a - b)
  if (levels.length === 0) return SILENT_DB
  const quiet = percentile(levels, policy.quietPercentile)
  const bearing = levels.filter((db) => db >= quiet + policy.speechOverQuietDb)
  return percentile(
    bearing.length > 0 ? bearing : levels,
    policy.speakingPercentile
  )
}

/** What the screener found at a take's edges, and the stretch it keeps. */
export type Screened = {
  /** The take from its lead before the first voiced frame to its tail after the last. */
  readonly kept: Stretch
  /** The record button's transient at each edge, where there was one. */
  readonly clicks: {
    readonly start: Stretch | null
    readonly end: Stretch | null
  }
  readonly speakingDb: number
  /** What is left in the kept stretch's silences. */
  readonly floorDb: number
  /** Whether that floor is above `noiseFloorMostDb`. */
  readonly noisy: boolean
  /** Each frame of the take: voiced or not. */
  readonly voiced: ReadonlyArray<boolean>
}

/** Runs of consecutive true values, as frame index ranges [from, to). */
function runsOf(
  flags: ReadonlyArray<boolean>
): Array<{ readonly from: number; readonly to: number }> {
  const runs: Array<{ from: number; to: number }> = []
  flags.forEach((on, i) => {
    if (!on) return
    const last = runs.at(-1)
    if (last?.to === i) last.to = i + 1
    else runs.push({ from: i, to: i + 1 })
  })
  return runs
}

/**
 * The take bounded to its voiced frames, its edge transients found by shape
 * and left out. A transient is a run of loud frames no longer than
 * `clickMostMs`, broadband, inside `edgeWindowMs` of its edge, with at
 * least `clickGuardMs` of quiet between it and the voice; a loud run that
 * fails any of these is voice, and is kept.
 */
export function screenEdges(
  frames: ReadonlyArray<TakeFrame>,
  policy: TakePolicy = TAKE_POLICY
): Screened {
  const f = policy.frameMs
  const speaking = speakingDb(frames, policy)
  const loud = frames.map(
    (fr) => fr.db >= speaking - policy.voicedUnderSpeakingDb
  )
  const runs = runsOf(loud)
  const totalMs = frames.length * f
  const broadband = (r: { from: number; to: number }): number => {
    const own = frames.slice(r.from, r.to)
    return own.reduce((n, fr) => n + fr.broadband, 0) / own.length
  }
  const isClick = (
    r: { from: number; to: number },
    next: { from: number; to: number } | undefined,
    atStart: boolean
  ): boolean =>
    (r.to - r.from) * f <= policy.clickMostMs &&
    broadband(r) >= policy.clickBroadband &&
    (atStart
      ? r.to * f <= policy.edgeWindowMs
      : r.from * f >= totalMs - policy.edgeWindowMs) &&
    (next === undefined ||
      (atStart ? next.from - r.to : r.from - next.to) * f >=
        policy.clickGuardMs)
  const first = runs[0]
  const startClick =
    first !== undefined && isClick(first, runs[1], true) ? first : null
  const last = runs.at(-1)
  const endClick =
    last !== undefined &&
    last !== startClick &&
    isClick(last, runs.at(-2), false)
      ? last
      : null
  const voicedRuns = runs.filter((r) => r !== startClick && r !== endClick)
  const voiced = frames.map((_, i) =>
    voicedRuns.some((r) => r.from <= i && i < r.to)
  )
  const stretch = (r: { from: number; to: number } | null): Stretch | null =>
    r === null ? null : { fromMs: r.from * f, toMs: r.to * f }
  const firstVoice = voicedRuns[0]
  const lastVoice = voicedRuns.at(-1)
  const kept: Stretch =
    firstVoice === undefined || lastVoice === undefined
      ? { fromMs: 0, toMs: 0 }
      : {
          fromMs: Math.max(
            firstVoice.from * f - policy.leadMs,
            startClick === null ? 0 : startClick.to * f
          ),
          toMs: Math.min(
            lastVoice.to * f + policy.tailMs,
            endClick === null ? totalMs : endClick.from * f
          ),
        }
  const quiet = frames
    .filter(
      (_, i) => !loud[i] && i * f >= kept.fromMs && (i + 1) * f <= kept.toMs
    )
    .map((fr) => fr.db)
    .sort((a, b) => a - b)
  const floorDb = quiet[Math.floor(quiet.length / 2)] ?? SILENT_DB
  return {
    kept,
    clicks: { start: stretch(startClick), end: stretch(endClick) },
    speakingDb: speaking,
    floorDb,
    noisy: floorDb > policy.noiseFloorMostDb,
    voiced,
  }
}

/**
 * The stretches of `within` a conditioned take keeps: every silence longer
 * than `gapMostMs` shortened to it from its middle, so each join is in
 * silence. In order, none empty.
 */
export function keptStretches(
  screened: Screened,
  within: Stretch = screened.kept,
  policy: TakePolicy = TAKE_POLICY
): ReadonlyArray<Stretch> {
  const f = policy.frameMs
  const half = policy.gapMostMs / 2
  const cuts: Array<Stretch> = []
  for (const run of runsOf(screened.voiced.map((v) => !v))) {
    const from = Math.max(run.from * f, within.fromMs)
    const to = Math.min(run.to * f, within.toMs)
    // A silence at the stretch's own edge is the lead or the tail.
    if (from <= within.fromMs || to >= within.toMs) continue
    if (to - from > policy.gapMostMs)
      cuts.push({ fromMs: from + half, toMs: to - half })
  }
  const kept: Array<Stretch> = []
  let at = within.fromMs
  for (const cut of cuts) {
    kept.push({ fromMs: at, toMs: cut.fromMs })
    at = cut.toMs
  }
  kept.push({ fromMs: at, toMs: within.toMs })
  return kept.filter((s) => s.toMs > s.fromMs)
}

/** Each join between kept stretches: where the cut audio meets. */
export const joinsOf = (kept: ReadonlyArray<Stretch>): ReadonlyArray<Stretch> =>
  kept.slice(1).map((s, i) => ({ fromMs: kept[i]?.toMs ?? 0, toMs: s.fromMs }))

/**
 * Where moment `ms` of the take plays in the conditioned audio: its place
 * in the kept stretches, sped up by `tempo`; null where it was cut.
 */
export function playedAt(
  ms: number,
  kept: ReadonlyArray<Stretch>,
  tempo: number
): number | null {
  let before = 0
  for (const s of kept) {
    if (ms < s.fromMs) return null
    if (ms <= s.toMs) return (before + ms - s.fromMs) / tempo
    before += s.toMs - s.fromMs
  }
  return null
}

/**
 * The transcript's words on the conditioned audio: each placed through the
 * same cut and tempo, so captions follow the voice. A word that was cut,
 * which only a word in a cut silence could be, is dropped.
 */
export function retimed(
  words: ReadonlyArray<TimedWord>,
  kept: ReadonlyArray<Stretch>,
  tempo: number
): ReadonlyArray<TimedWord> {
  return words.flatMap((w) => {
    const startMs = playedAt(w.startMs, kept, tempo)
    const endMs = playedAt(w.endMs, kept, tempo)
    return startMs === null || endMs === null
      ? []
      : [
          {
            text: w.text,
            startMs: Math.round(startMs),
            endMs: Math.round(endMs),
          },
        ]
  })
}

/**
 * The span of a long take that words `first` to `last` (indices into its
 * transcript) are said in: each edge in the middle of the silence between
 * the turn's outer word and its neighbour, so no word is cut and none of a
 * neighbour's spills in; at the take's own edges, its first word's start
 * and its last's end plus the tail. Null for indices outside the words.
 */
export function spanOf(
  words: ReadonlyArray<TimedWord>,
  first: number,
  last: number,
  policy: TakePolicy = TAKE_POLICY
): Stretch | null {
  const from = words[first]
  const to = words[last]
  if (from === undefined || to === undefined || first > last) return null
  const before = words[first - 1]
  const after = words[last + 1]
  return {
    fromMs:
      before === undefined
        ? Math.max(0, from.startMs - policy.leadMs)
        : Math.round((before.endMs + from.startMs) / 2),
    toMs:
      after === undefined
        ? to.endMs + policy.tailMs
        : Math.round((to.endMs + after.startMs) / 2),
  }
}

/** A word as compared: its letters and digits, lower case. */
const bare = (text: string): string =>
  text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "")

/** The words a span of a take holds: each whose middle falls inside it. */
export const spanWords = (
  words: ReadonlyArray<TimedWord>,
  span: Stretch
): ReadonlyArray<TimedWord> =>
  words.filter((w) => {
    const middle = (w.startMs + w.endMs) / 2
    return middle >= span.fromMs && middle < span.toMs
  })

/**
 * Every way a turn cut from a long take disagrees with its words: an edge
 * that falls inside a word, and a turn whose text isn't what the span's
 * words say (the third pain point's sentence moved into the fourth's turn).
 */
export function spanProblems(
  turn: { readonly id: string; readonly text: string },
  words: ReadonlyArray<TimedWord>,
  span: Stretch
): ReadonlyArray<string> {
  const problems: Array<string> = []
  for (const edge of [span.fromMs, span.toMs]) {
    const cut = words.find((w) => w.startMs < edge && edge < w.endMs)
    if (cut !== undefined)
      problems.push(`${turn.id}: its span cuts "${cut.text}" at ${edge} ms`)
  }
  const said = spanWords(words, span)
    .map((w) => bare(w.text))
    .filter(Boolean)
  const meant = turn.text.split(/\s+/).map(bare).filter(Boolean)
  if (said.join(" ") !== meant.join(" "))
    problems.push(
      `${turn.id}: its span says "${said.join(" ")}", and the turn "${meant.join(" ")}"`
    )
  return problems
}

/**
 * A span of a long take bounded to its own voiced frames: from a lead
 * before its first to a tail after its last, never past the span or into
 * an edge transient. The whole take's own bound when no span is named.
 */
export function boundedTo(
  screened: Screened,
  span: Stretch | undefined,
  policy: TakePolicy = TAKE_POLICY
): Stretch {
  if (span === undefined) return screened.kept
  const f = policy.frameMs
  const inside = screened.voiced.flatMap((v, i) =>
    v && i * f >= span.fromMs && (i + 1) * f <= span.toMs ? [i] : []
  )
  const first = inside[0]
  const last = inside.at(-1)
  if (first === undefined || last === undefined)
    return { fromMs: span.fromMs, toMs: span.fromMs }
  return {
    fromMs: Math.max(
      span.fromMs,
      screened.kept.fromMs,
      first * f - policy.leadMs
    ),
    toMs: Math.min(
      span.toMs,
      screened.kept.toMs,
      (last + 1) * f + policy.tailMs
    ),
  }
}

/** How one turn's take is played (conversation/2's conditioning): its tempo, loudness and longest gap. */
export type TakeConditioning = {
  readonly tempo: number
  readonly loudnessLufs: number
  readonly gapMostMs: number
}

/** The policy's conditioning, for a turn that names none. */
export const DEFAULT_CONDITIONING: TakeConditioning = {
  tempo: TAKE_POLICY.tempo,
  loudnessLufs: TAKE_POLICY.loudnessLufs,
  gapMostMs: TAKE_POLICY.gapMostMs,
}

/** A take conditioned: what the screener found, what was kept, and its words on the new audio. */
export type ConditionedTake = {
  readonly screened: Screened
  readonly kept: ReadonlyArray<Stretch>
  readonly words: ReadonlyArray<TimedWord> | null
}

/**
 * One turn's take conditioned into `out`: screened, bounded to its span,
 * its long silences shortened, denoised, sped up and brought to its
 * loudness, in three ffmpeg calls (cut, measure, level) whose bytes depend
 * only on the take and the conditioning. `wav` is the take's bytes, read
 * by the caller; `work` holds the step's own file.
 */
export async function conditionTake(
  ports: Pick<Ports, "ffmpeg">,
  take: {
    readonly file: string
    readonly wav: Uint8Array
    readonly span?: Stretch
    readonly words?: ReadonlyArray<TimedWord>
  },
  conditioning: TakeConditioning,
  work: string,
  out: string
): Promise<Parsed<ConditionedTake>> {
  const read = samplesOf(take.wav)
  if (read === null)
    return { ok: false, problems: [`${take.file}: it isn't a 16-bit PCM WAV`] }
  const policy = { ...TAKE_POLICY, gapMostMs: conditioning.gapMostMs }
  const screened = screenEdges(framesOf(read.samples, read.rate), policy)
  const within = boundedTo(screened, take.span, policy)
  if (within.toMs <= within.fromMs)
    return { ok: false, problems: [`${take.file}: nothing in it is voiced`] }
  const kept = keptStretches(screened, within, policy)
  const raw = `${work}/conditioned.wav`
  const target = loudnessAt(conditioning.loudnessLufs)
  const cut = await ports.ffmpeg(
    planCondition(
      take.file,
      {
        kept,
        floorDb: screened.floorDb,
        tempo: conditioning.tempo,
        fadeMs: policy.joinFadeMs,
      },
      raw
    )
  )
  if (!cut.ok) return { ok: false, problems: [`${take.file}: ${cut.stderr}`] }
  const measured = await ports.ffmpeg(planMeasure(raw, target))
  const loudness = readLoudness(measured.stderr)
  if (!measured.ok || loudness === null)
    return {
      ok: false,
      problems: [`${take.file}: its loudness wasn't measured`],
    }
  const levelled = await ports.ffmpeg(planLevel(raw, loudness, out, target))
  if (!levelled.ok)
    return { ok: false, problems: [`${take.file}: ${levelled.stderr}`] }
  return {
    ok: true,
    value: {
      screened,
      kept,
      words:
        take.words === undefined
          ? null
          : retimed(take.words, kept, conditioning.tempo),
    },
  }
}
