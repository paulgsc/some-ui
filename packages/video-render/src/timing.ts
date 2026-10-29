/**
 * Where every scene sits in the finished video. Frames are the truth: a
 * scene lasts a whole number of frames, and a transition overlaps the two
 * scenes it joins by a whole number, so the times written out
 * (`shot-times.json`) are exactly where the renderer put each scene, and a
 * note pinned to a scene maps to a timestamp on any revision.
 */

import { TRANSITION_MS } from "./vocabulary"
import type { Transition } from "./vocabulary"

/** A scene long enough for its take: the take, a breath before and after. */
export function fitToTake(fit: {
  readonly takeMs: number
  readonly voiceInMs: number
  readonly tailMs: number
  /** Longer when the picture needs it. */
  readonly minMs: number
}): number {
  return Math.max(
    fit.minMs,
    Math.round(fit.voiceInMs + fit.takeMs + fit.tailMs)
  )
}

export const toFrames = (ms: number, fps: number): number =>
  Math.round((ms * fps) / 1000)

export const toMs = (frames: number, fps: number): number =>
  Math.round((frames * 1000) / fps)

export type Placed = {
  readonly id: string
  readonly cut: string | undefined
  readonly startFrame: number
  readonly frames: number
  /** Frames this scene's transition in overlaps the scene before. */
  readonly overlapFrames: number
}

export type Placement =
  | {
      readonly ok: true
      readonly shots: ReadonlyArray<Placed>
      readonly totalFrames: number
    }
  | { readonly ok: false; readonly problems: ReadonlyArray<string> }

/**
 * Each scene's start and length in frames. A transition takes its overlap
 * from both scenes, so it must fit in half of each.
 */
export function place(
  shots: ReadonlyArray<{
    readonly id: string
    readonly cut?: string | undefined
    readonly durationMs: number
    readonly transitionIn: Transition
  }>,
  fps: number
): Placement {
  const placed: Array<Placed> = []
  const problems: Array<string> = []
  let start = 0
  shots.forEach((s, i) => {
    const frames = toFrames(s.durationMs, fps)
    const overlapFrames =
      i === 0 ? 0 : toFrames(TRANSITION_MS[s.transitionIn], fps)
    const before = placed[i - 1]
    if (before && 2 * overlapFrames > Math.min(before.frames, frames)) {
      problems.push(
        `${s.id}: the ${s.transitionIn} into it is longer than half a scene`
      )
    }
    if (before) start = before.startFrame + before.frames - overlapFrames
    placed.push({
      id: s.id,
      cut: s.cut,
      startFrame: start,
      frames,
      overlapFrames,
    })
  })
  if (problems.length) return { ok: false, problems }
  const last = placed[placed.length - 1]
  return {
    ok: true,
    shots: placed,
    totalFrames: last ? last.startFrame + last.frames : 0,
  }
}

/** What `shot-times.json` holds: each scene's start and length, in ms. */
export type ShotTime = {
  readonly id: string
  readonly cut: string | null
  readonly startMs: number
  readonly durationMs: number
}

export function shotTimes(
  placed: ReadonlyArray<Placed>,
  fps: number
): ReadonlyArray<ShotTime> {
  return placed.map((p) => ({
    id: p.id,
    cut: p.cut ?? null,
    startMs: toMs(p.startFrame, fps),
    durationMs: toMs(p.frames, fps),
  }))
}
