/**
 * What the renderer can draw: every effect a plan, the phone's menus or a
 * scene's override may name. Each union below is matched by an exhaustive
 * `switch` in `plan.ts`, so a member the renderer cannot draw does not
 * type-check, and the phone, reading these same lists, can never offer one.
 *
 * Text drawn into the frame (headlines, captions, cards, the authorship
 * mark) is not here: those are burn-ins (STUDIO ST15), drawn by their own
 * workspace and composited by the renderer.
 */

/** How one scene gives way to the next. */
export const TRANSITIONS = [
  "cut",
  "crossfade",
  "dip-to-black",
  "slide-up",
  "wipe",
  "zoom",
] as const

export type Transition = (typeof TRANSITIONS)[number]

/** How long each transition overlaps the two scenes it joins, in ms. */
export const TRANSITION_MS: Readonly<Record<Transition, number>> = {
  cut: 0,
  crossfade: 400,
  "dip-to-black": 500,
  "slide-up": 350,
  wipe: 400,
  zoom: 400,
}

/** How the picture moves over a scene. Times are ms into the scene. */
export type Motion =
  | { readonly kind: "still" }
  /** A slow zoom in over the whole scene, by `amount` (0.1 is 10%). */
  | { readonly kind: "push-in"; readonly amount: number }
  /** The reverse: starts zoomed in by `amount`, ends on the whole window. */
  | { readonly kind: "pull-out"; readonly amount: number }
  /**
   * The window moves down the screen through `keys`, each a time and a
   * height into the screen in the capture's CSS px, eased between keys
   * (the timeline's crop keys).
   */
  | {
      readonly kind: "pan"
      readonly keys: ReadonlyArray<readonly [ms: number, cssY: number]>
    }
  /** At each time in `at`, a quick zoom in by `amount` that holds. */
  | {
      readonly kind: "punch-in"
      readonly at: ReadonlyArray<number>
      readonly amount: number
    }
  /** The picture stops at `atMs` and holds that frame to the scene's end. */
  | { readonly kind: "freeze"; readonly atMs: number }

export type MotionKind = Motion["kind"]

export const MOTION_KINDS: ReadonlyArray<MotionKind> = [
  "still",
  "push-in",
  "pull-out",
  "pan",
  "punch-in",
  "freeze",
]

/** The sound kit's names. A series maps each to a CC0 file. */
export const SOUNDS = [
  "whoosh",
  "click",
  "pop",
  "thud",
  "riser",
  "ding",
] as const

export type Sound = (typeof SOUNDS)[number]

/** A sound placed at a time in the scene, in ms. */
export type SoundCue = { readonly sound: Sound; readonly atMs: number }

/** The music bed under a whole video. */
export const MUSIC_MODES = ["off", "under-voice", "up-between-lines"] as const

export type MusicMode = (typeof MUSIC_MODES)[number]

/** A file the renderer reads, named by the checksum it must still have. */
export type CheckedFile = { readonly file: string; readonly sha256: string }

/** What fills the frame behind the picture's window. */
export type Background =
  /** The series' ground colour: the picture as recorded, in its window. */
  | { readonly kind: "as-captured" }
  /** The picture itself, blurred and filling the frame. */
  | { readonly kind: "blurred" }
  /** An image, read by its checksum so a changed one is named, never used. */
  | { readonly kind: "image"; readonly image: CheckedFile }

export type BackgroundKind = Background["kind"]
