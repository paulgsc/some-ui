/**
 * Whose idea and whose hands each scene shows (STUDIO ST16, #2274): the data
 * the authorship mark (`@some-ui/burn-ins`' `authorship` kind) draws, read
 * from the cut list and the step table, so nothing in it is guessed.
 *
 * - The idea's origin is the scene's `idea`, the one judgement: Claude
 *   proposes it with its citation and the owner confirms it (ST5). A scene
 *   that says nothing is an agent's.
 * - Its wording follows the voice: a take said under Ad-lib is the owner's
 *   words; a take read word for word, or a scene with no take (whose words
 *   on screen a session wrote), is an agent's.
 * - The hands are the steps in `steps.ts` whose writes made the scene, by
 *   kind: the owner's own, Claude's, or code (the small speech model too),
 *   whoever runs it today.
 *
 * Nothing here ever reports `you` that the data doesn't say: an origin needs
 * a citation, a wording needs the owner's ad-libbed take, a hand needs the
 * owner's own step (`__tests__/authorship.test.ts`).
 */

import { AUTHORSHIP } from "./cut-list"
import type { BurnIn, CutList, Shot } from "./cut-list"
import { STEPS } from "./steps"
import type { Step, StepKind } from "./steps"
import type { Placement } from "./timing"

/** Who an idea can come from. */
export type Origin = "you" | "agent" | "source"
/** Who can word an idea. */
export type Wording = "you" | "agent"
/** Who can make what is on screen. */
export type Hand = "you" | "agent" | "code"

/** The hands in the one order the mark and its record list them. */
export const HANDS: ReadonlyArray<Hand> = ["you", "agent", "code"]

export type SceneAuthorship = {
  readonly shot: string
  readonly origin: Origin
  readonly wording: Wording
  readonly hands: ReadonlyArray<Hand>
}

const HAND_OF: Readonly<Record<StepKind, Hand>> = {
  owner: "you",
  claude: "agent",
  code: "code",
  "small-model": "code",
}

/**
 * Whether a scene carries what a step writes to `field`: a picture other
 * than the bare ground, a take, an override; any other scene field always.
 * A video-wide field is not one scene's picture or sound.
 */
function carries(shot: Shot, field: string): boolean {
  if (!field.startsWith("shots.")) return false
  const inner = field.slice("shots.".length)
  if (inner === "picture") return shot.picture.kind !== "card"
  if (inner === "take") return shot.take !== undefined
  if (inner === "overrides") {
    return Object.keys(shot.overrides).length > 0
  }
  return true
}

/** Whether a step's work is in this scene: a field of it, or the video it is drawn into. */
const makes = (step: Step, shot: Shot): boolean =>
  step.writes.some((io) =>
    "field" in io ? carries(shot, io.field) : io.file === "video.mp4"
  )

export function handsOf(
  shot: Shot,
  steps: ReadonlyArray<Step> = STEPS
): ReadonlyArray<Hand> {
  const hands = new Set(
    steps.filter((s) => makes(s, shot)).map((s) => HAND_OF[s.kind])
  )
  return HANDS.filter((h) => hands.has(h))
}

export function wordingOf(shot: Shot, voice: CutList["voice"]): Wording {
  if (!shot.take) return "agent"
  const said = shot.voice ?? (voice === "mixed" ? undefined : voice)
  return said === "ad-lib" ? "you" : "agent"
}

export function authorshipOf(
  cut: CutList,
  steps: ReadonlyArray<Step> = STEPS
): ReadonlyArray<SceneAuthorship> {
  return cut.shots.map((shot) => ({
    shot: shot.id,
    origin: shot.idea.origin,
    wording: wordingOf(shot, cut.voice),
    hands: handsOf(shot, steps),
  }))
}

/**
 * The authorship mark's params: each scene's authorship and when it starts,
 * at its exact frame time (`frame * 1000 / fps`, never rounded), so the
 * mark changes on the frame the scene does.
 */
export function authorshipParams(
  cut: CutList,
  placement: Placement,
  fps: number,
  steps: ReadonlyArray<Step> = STEPS
): BurnIn["params"] {
  const scenes = authorshipOf(cut, steps).map((a, i) => {
    const at = placement.shots[i]
    if (!at) throw new Error(`${a.shot} was not placed`)
    return {
      startMs: (at.startFrame * 1000) / fps,
      origin: a.origin,
      wording: a.wording,
      hands: a.hands,
    }
  })
  return { scenes, endMs: (placement.totalFrames * 1000) / fps }
}

/** Whether a burn-in is the authorship mark. */
export const isAuthorship = (b: BurnIn): boolean => b.kind === AUTHORSHIP
