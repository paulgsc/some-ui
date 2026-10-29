/**
 * Every lever for every scene, from the lowest layer that sets it: the
 * scene's override, then the scene's look, then the video's look. Pure, so
 * the phone can show the same answer the renderer will draw.
 */

import { assertNever } from "@some-ui/core-utils"

import type { CutList, Shot } from "./cut-list"
import { LOOK_RULES } from "./plans"
import type { Look, LookMotion } from "./plans"
import type { Series } from "./series"
import type {
  Background,
  Motion,
  MusicMode,
  SoundCue,
  Transition,
} from "./vocabulary"

export type ResolvedShot = {
  readonly shot: Shot
  readonly look: Look
  readonly transitionIn: Transition
  readonly motion: Motion
  readonly cues: ReadonlyArray<SoundCue>
  readonly background: Background
}

export type Resolved = {
  readonly shots: ReadonlyArray<ResolvedShot>
  readonly music: MusicMode
}

export type Resolution =
  | ({ readonly ok: true } & Resolved)
  | { readonly ok: false; readonly problems: ReadonlyArray<string> }

export function resolve(cutList: CutList, series: Series): Resolution {
  const problems: Array<string> = []
  if (cutList.series.id !== series.id) {
    problems.push(
      `the video pins series ${cutList.series.id}, not ${series.id}`
    )
  } else if (cutList.series.version !== series.version) {
    problems.push(
      `the video pins version ${cutList.series.version} of ${series.id}, not ${series.version}`
    )
  }
  const shots = cutList.shots.map((shot, i) =>
    resolveShot(shot, i, cutList.look)
  )
  for (const s of shots) {
    for (const c of s.cues) {
      if (!series.sounds[c.sound]) {
        problems.push(`${s.shot.id}: the series has no ${c.sound} sound`)
      }
    }
    if (s.background.kind === "blurred" && s.shot.picture.kind === "card") {
      problems.push(`${s.shot.id}: a card has no picture to blur`)
    }
  }
  const music = cutList.music ?? LOOK_RULES[cutList.look].music
  if (music !== "off" && !series.music) {
    problems.push(`the music is ${music}, and the series has no music bed`)
  }
  return problems.length ? { ok: false, problems } : { ok: true, shots, music }
}

function resolveShot(shot: Shot, index: number, videoLook: Look): ResolvedShot {
  const look = shot.look ?? videoLook
  const rules = LOOK_RULES[look]
  const o = shot.overrides
  const taps = shot.picture.kind === "capture" ? shot.picture.taps : []
  const cues: Array<SoundCue> = []
  if (rules.cues.sceneStart)
    cues.push({ sound: rules.cues.sceneStart, atMs: 0 })
  if (rules.cues.tap) {
    for (const atMs of taps) cues.push({ sound: rules.cues.tap, atMs })
  }
  return {
    shot,
    look,
    // The first scene has nothing to come in from.
    transitionIn: index === 0 ? "cut" : (o.transitionIn ?? rules.transition),
    motion:
      o.motion ??
      (shot.picture.kind === "card"
        ? { kind: "still" }
        : lookMotion(rules.motion, taps)),
    cues: o.cues ?? cues,
    background: o.background ?? { kind: "as-captured" },
  }
}

function lookMotion(m: LookMotion, taps: ReadonlyArray<number>): Motion {
  switch (m.kind) {
    case "still": {
      return { kind: "still" }
    }
    case "push-in": {
      return { kind: "push-in", amount: m.amount }
    }
    case "punch-in-at-taps": {
      return taps.length
        ? { kind: "punch-in", at: taps, amount: m.amount }
        : { kind: "still" }
    }
    default: {
      return assertNever(m)
    }
  }
}
