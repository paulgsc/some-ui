/**
 * A scene's picture as one photographed screen, zoomed to its parts in
 * turn (RR31, #3288; calls C795, C796): `@some-ui/video-motion`'s
 * `screen-zoom` composition, given a screen of a `some-ui.screens/1` record
 * (`./screen`) and the regions to point at. Any cut list may place it: the
 * Rust essay's question scenes (`essay.ts`), or a general essay's scene on
 * any screen with named parts.
 */

import type { Composition } from "./cut-list"
import type { Box, RegionRef, Screen, Screens } from "./screen"
import { regionOf } from "./screen"
import type { WalkFile } from "./walk"

/** The composition that zooms a screen (`@some-ui/video-motion`). */
export const SCREEN_ZOOM = "screen-zoom"

/** The most regions one scene zooms to, so each holds long enough to read. */
export const ZOOM_STOPS_MOST = 10

/** The most of the frame's height a zoom keeps clear at its foot. */
const FOOT_MOST = 0.5

/** How a screen is drawn in a scene: the look the zoom and the whole screen share. */
export type ZoomOptions = {
  /** The record's folder in the video's folder. */
  readonly dir?: string
  /** The share of the frame's height kept clear at its foot, for captions. */
  readonly foot?: number
  /** The app's theme its ground is drawn in, as `brand-v1` takes it. */
  readonly theme?: string
  /** The colour around the screen; the composition's own when absent. */
  readonly ground?: string
}

/** The look's variables, as screen-zoom declares them. */
const lookOf = (
  foot: number,
  theme: string | undefined,
  ground: string | undefined
): Record<string, unknown> => ({
  foot,
  ...(theme === undefined ? {} : { theme }),
  ...(ground === undefined ? {} : { ground }),
})

/** `foot`, refused outside 0 to `FOOT_MOST`, before anything else is read. */
function footOf(foot: number): void {
  if (!(foot >= 0 && foot <= FOOT_MOST))
    throw new Error(
      `a foot of ${String(foot)}: a screen keeps 0 to ${String(FOOT_MOST)} of the frame for captions`
    )
}

/** The screen-zoom composition on `screen`, its stops in CSS px of the picture. */
function screenZoom(
  screen: Screen,
  stops: ReadonlyArray<Box>,
  { dir = "screens", foot = 0, theme, ground }: ZoomOptions
): Composition {
  footOf(foot)
  const file = `${dir}/${screen.file}`
  return {
    kind: "composition",
    ref: SCREEN_ZOOM,
    variables: {
      picture: file,
      width: screen.width,
      height: screen.height,
      scale: screen.scale,
      stops: JSON.stringify(stops),
      ...lookOf(foot, theme, ground),
    },
    files: [file],
  }
}

/**
 * The picture zooming into `refs` in order, on the screen they name, with
 * its file under `dir` in the video's folder: the first `ZOOM_STOPS_MOST`
 * that a screen in `screens` holds, the rest left out. Null when none is
 * held. Every ref held, kept or not, must be of one screen: a scene shows
 * one picture.
 */
export function zoomPicture(
  screens: Screens,
  refs: ReadonlyArray<RegionRef>,
  options: ZoomOptions = {}
): Composition | null {
  footOf(options.foot ?? 0)
  const found = refs.flatMap((ref) => {
    const region = regionOf(screens, ref)
    return region ? [region] : []
  })
  const [first] = found
  if (first === undefined) return null
  const { screen } = first
  const other = found.find((each) => each.screen.id !== screen.id)
  if (other !== undefined)
    throw new Error(
      `${other.region.ref} is not on ${screen.id}: a scene zooms into one screen`
    )
  const held = found.slice(0, ZOOM_STOPS_MOST)
  return screenZoom(
    screen,
    held.map(({ region }) => region.box),
    options
  )
}

/**
 * The whole of `screen` as a scene's picture (SNIPS4; the owner,
 * 2026-11-21): the screen-zoom composition with no stops, so the phone is
 * held whole in the room above the frame's foot, where the captions draw,
 * as large as fits there: never full-bleed, and the caption never over the
 * app's own screen. Its ground is `ground` where given, else the
 * composition's own.
 */
export const wholePicture = (
  screen: Screen,
  options: ZoomOptions = {}
): Composition => screenZoom(screen, [], options)

/**
 * A walk played as a scene's picture (#3476): the screen-zoom composition
 * held whole, as `wholePicture` holds a screen, showing each of the walk's
 * screens in turn on the walk's own timeline, stretched or pressed to the
 * scene's length, with a ring where each tap lands. `files` are the walk's
 * pictures in its steps' order, under `dir` in the video's folder.
 */
export function walkPicture(
  walk: WalkFile,
  files: ReadonlyArray<string>,
  { dir = "walks", foot = 0, theme, ground }: ZoomOptions = {}
): Composition {
  footOf(foot)
  const placed = files.map((file) => `${dir}/${file}`)
  const [first = ""] = placed
  return {
    kind: "composition",
    ref: SCREEN_ZOOM,
    variables: {
      picture: first,
      width: walk.viewport.width,
      height: walk.viewport.height,
      scale: walk.viewport.scale,
      stops: "[]",
      walk: JSON.stringify({
        frames: walk.snips.map((s, i) => ({
          picture: placed[i] ?? first,
          atMs: s.atMs,
        })),
        taps: walk.taps.map(({ atMs, x, y }) => ({ atMs, x, y })),
        lengthMs: walk.lengthMs,
      }),
      ...lookOf(foot, theme, ground),
    },
    files: placed,
  }
}
