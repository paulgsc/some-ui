/**
 * Today's shorts (the build-journal skill's `timeline.json`, rendered by its
 * `render.py`) as cut list v2, so a short made before this workspace renders
 * here unchanged. Pure: the caller reads the recorder's marks beside each
 * capture and each take's length, and passes them in.
 *
 * What v1 drew itself (the kicker, headline and provenance line above a
 * capture, a card's body and note) becomes burn-in data (STUDIO ST15), kept
 * word for word. v1 cut straight between scenes, so the result uses the
 * Plain look and the Read voice its primers were written for.
 */

import { z } from "zod"

import { CUT_LIST_SCHEMA, once, parseCutList, problemsOf } from "./cut-list"
import type { BurnIn, CutList, Parsed, Shot } from "./cut-list"
import { fitToTake } from "./timing"

/** A time in seconds, or a recorder mark and seconds from it. */
const AtSchema = z.union([
  z.number(),
  z.object({ mark: z.string().min(1), at: z.number().default(0) }),
])
type At = z.infer<typeof AtSchema>

const ViewSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("full") }),
  z.object({
    mode: z.literal("crop"),
    keys: z.array(z.tuple([AtSchema, z.number()])).min(1),
    zoom: z.number().default(1),
    x: z.number().default(0),
  }),
])

const V1ShotSchema = z.object({
  id: z.string(),
  cut: z.string().optional(),
  duration: z.number().positive(),
  kind: z.enum(["capture", "still", "card", "slot"]),
  provenance: z.enum(["browser", "phone"]).optional(),
  kicker: z.string().optional(),
  headline: z.string().default(""),
  label: z.string().optional(),
  body: z.string().optional(),
  note: z.string().optional(),
  source: z.string().optional(),
  in: AtSchema.optional(),
  out: AtSchema.optional(),
  speed: z.number().positive().default(1),
  view: ViewSchema.optional(),
  take_in: z.number().nonnegative().optional(),
  take_out: z.number().positive().optional(),
  min: z.number().nonnegative().optional(),
  voice_in: z.number().nonnegative().default(0.2),
  tail: z.number().nonnegative().default(0.5),
})

const V1Schema = z.object({
  project: z.string().min(1),
  shots: z.array(V1ShotSchema).min(1),
})

/** The provenance line v1 wrote under every capture's headline. */
export const V1_PROVENANCE = {
  browser: "Phone build, recorded in a browser · sound off",
  phone: "Recorded on my phone",
} as const

export type V1Inputs = {
  /** The recorder's marks for each capture: name to seconds. */
  readonly marks: ReadonlyMap<string, ReadonlyMap<string, number>>
  /** Each cut's take: its file (relative to the video) and its length. */
  readonly takes: ReadonlyMap<
    string,
    { readonly file: string; readonly lengthMs: number }
  >
  readonly series: CutList["series"]
}

const ms = (seconds: number): number => Math.round(seconds * 1000)

export function fromTimelineV1(
  raw: unknown,
  inputs: V1Inputs
): Parsed<CutList> {
  const parsed = V1Schema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, problems: problemsOf(parsed.error, "timeline") }
  }
  const problems: Array<string> = []
  const shots = parsed.data.shots.map((s) => {
    const marks = s.source ? inputs.marks.get(s.source) : undefined
    const at = (v: At): number => {
      if (typeof v === "number") return v
      const t = marks?.get(v.mark)
      if (t === undefined) {
        problems.push(
          `${s.id}: no mark "${v.mark}" beside ${s.source ?? "its capture"}`
        )
        return 0
      }
      return t + v.at
    }
    return shotOf(s, at, marks, inputs, problems)
  })
  if (problems.length) return { ok: false, problems: once(problems) }
  // What is written must render: checked here, not by the next reader.
  return parseCutList({
    schema: CUT_LIST_SCHEMA,
    title: parsed.data.project,
    series: inputs.series,
    look: "plain",
    voice: "read",
    shots,
  })
}

/**
 * Pan keys inside a scene fitted to its take: a key past the end can never
 * be seen, so the pan stops at the end where it would have been then.
 */
function withinScene(
  keys: ReadonlyArray<[number, number]>,
  durationMs: number
): Array<[number, number]> {
  const kept = keys.filter(([t]) => t <= durationMs)
  const before = kept[kept.length - 1]
  const after = keys.find(([t]) => t > durationMs)
  if (!after) return kept
  if (!before) return [[durationMs, after[1]]]
  if (before[0] === durationMs) return kept
  const k =
    (1 -
      Math.cos((Math.PI * (durationMs - before[0])) / (after[0] - before[0]))) /
    2
  return [
    ...kept,
    [durationMs, Math.round(before[1] + (after[1] - before[1]) * k)],
  ]
}

function shotOf(
  s: z.infer<typeof V1ShotSchema>,
  at: (v: At) => number,
  marks: ReadonlyMap<string, number> | undefined,
  inputs: V1Inputs,
  problems: Array<string>
): Shot {
  const take = s.cut ? inputs.takes.get(s.cut) : undefined
  const takeIn = s.take_in ?? 0
  const takeOut = s.take_out ?? (take ? take.lengthMs / 1000 : 0)
  const durationMs = take
    ? fitToTake({
        takeMs: ms(takeOut - takeIn),
        voiceInMs: ms(s.voice_in),
        tailMs: ms(s.tail),
        minMs: ms(s.min ?? 0),
      })
    : ms(s.duration)
  const burnIns: Array<BurnIn> = []
  if (s.kind === "capture" || s.kind === "still") {
    const line = s.provenance ? V1_PROVENANCE[s.provenance] : ""
    burnIns.push({
      kind: "headline",
      design: "v1",
      params: {
        kicker: s.kicker ?? "",
        headline: s.headline,
        line: s.label ? `${line}  ·  ${s.label}` : line,
      },
    })
  } else {
    burnIns.push({
      kind: "card",
      design: "v1",
      params: {
        kicker: s.kicker ?? "",
        headline: s.headline,
        body: s.body ?? "",
        note: s.note ?? "",
        ...(s.kind === "slot" ? { slot: true } : {}),
      },
    })
  }
  const base = {
    id: s.id,
    ...(s.cut ? { cut: s.cut } : {}),
    durationMs,
    ...(take
      ? { take: { file: take.file, inMs: ms(takeIn), outMs: ms(takeOut) } }
      : {}),
    voiceInMs: ms(s.voice_in),
    burnIns,
    // A render.py short says nothing about whose idea a scene is.
    idea: { origin: "agent" as const },
  }
  if (s.kind !== "capture" && s.kind !== "still") {
    return { ...base, picture: { kind: "card" }, overrides: {} }
  }
  if (!s.source) {
    problems.push(`${s.id}: a ${s.kind} with no source`)
    return { ...base, picture: { kind: "card" }, overrides: {} }
  }
  if (s.kind === "still") {
    return {
      ...base,
      picture: { kind: "still", source: s.source },
      overrides: {},
    }
  }
  const inS = s.in === undefined ? 0 : at(s.in)
  const outS = s.out === undefined ? undefined : at(s.out)
  /** A source time as ms into the scene. */
  const scene = (t: number): number => Math.max(0, ms((t - inS) / s.speed))
  const taps = [...(marks ?? new Map<string, number>()).entries()]
    .filter(
      ([name, t]) =>
        name.startsWith("tap") && t >= inS && (outS === undefined || t <= outS)
    )
    .map(([, t]) => scene(t))
    .filter((t) => t < durationMs)
    .sort((a, b) => a - b)
  const view = s.view ?? {
    mode: "crop" as const,
    keys: [[0, 0]],
    zoom: 1,
    x: 0,
  }
  let motion: Shot["overrides"]["motion"]
  let y = 0
  if (view.mode === "crop") {
    // A key's time is seconds into the scene, or a mark (source time).
    const keys = view.keys.map(([t, cssY]): [number, number] => [
      typeof t === "number" ? ms(t) : scene(at(t)),
      cssY,
    ])
    y = keys[0]?.[1] ?? 0
    const kept = withinScene(keys, durationMs)
    if (kept.length > 1) motion = { kind: "pan", keys: kept }
  }
  return {
    ...base,
    picture: {
      kind: "capture",
      source: s.source,
      inMs: ms(inS),
      ...(outS === undefined ? {} : { outMs: ms(outS) }),
      speed: s.speed,
      cssWidth: 412,
      framing:
        view.mode === "full"
          ? { mode: "full" }
          : { mode: "crop", zoom: view.zoom, x: view.x, y },
      taps,
    },
    overrides: motion ? { motion } : {},
  }
}
