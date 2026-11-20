/**
 * A scene's picture as one photographed screen, zoomed to its parts in
 * turn (RR31, #3288; calls C795, C796): `@some-ui/video-motion`'s
 * `screen-zoom` composition, given a screen of a `some-ui.screens/1` record
 * (`./screen`) and the regions to point at. Any cut list may place it: the
 * Rust essay's question scenes (`essay.ts`), or a general essay's scene on
 * any screen with named parts.
 */

import type { Composition } from "./cut-list"
import type { RegionRef, Screens } from "./screen"
import { regionOf } from "./screen"

/** The composition that zooms a screen (`@some-ui/video-motion`). */
export const SCREEN_ZOOM = "screen-zoom"

/** The most regions one scene zooms to, so each holds long enough to read. */
export const ZOOM_STOPS_MOST = 10

/**
 * The picture zooming into `refs` in order, on the screen they name, with
 * its file under `dir` in the video's folder; refs no screen in `screens`
 * holds are left out. Null when none is held. Every ref held must be of one
 * screen: a scene shows one picture.
 */
export function zoomPicture(
  screens: Screens,
  refs: ReadonlyArray<RegionRef>,
  {
    dir = "screens",
    foot = 0,
    theme,
  }: {
    /** The record's folder in the video's folder. */
    readonly dir?: string
    /** The share of the frame's height kept clear at its foot, for captions. */
    readonly foot?: number
    /** The app's theme its ground is drawn in, as `brand-v1` takes it. */
    readonly theme?: string
  } = {}
): Composition | null {
  const held = refs.flatMap((ref) => {
    const found = regionOf(screens, ref)
    return found ? [found] : []
  })
  const [first] = held
  if (first === undefined) return null
  const { screen } = first
  const other = held.find((each) => each.screen.id !== screen.id)
  if (other !== undefined)
    throw new Error(
      `${other.region.ref} is not on ${screen.id}: a scene zooms into one screen`
    )
  if (held.length > ZOOM_STOPS_MOST)
    throw new Error(
      `${String(held.length)} regions of ${screen.id}: a scene zooms to at most ${String(ZOOM_STOPS_MOST)}`
    )
  const file = `${dir}/${screen.file}`
  return {
    kind: "composition",
    ref: SCREEN_ZOOM,
    variables: {
      picture: file,
      width: screen.width,
      height: screen.height,
      scale: screen.scale,
      stops: JSON.stringify(held.map(({ region }) => region.box)),
      foot,
      ...(theme === undefined ? {} : { theme }),
    },
    files: [file],
  }
}
