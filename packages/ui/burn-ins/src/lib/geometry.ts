/**
 * The frames a burn-in is drawn into, and where in each it may sit
 * (SFEED11, #2707): the 9:16 short (1080x1920: Playoff Delta, the Build
 * Journal shorts) and the 16:9 video (1920x1080: the weekly call). Any other
 * frame is refused, by name (`frameProblem`), never stretched to one of them.
 *
 * YouTube draws its own controls over a video, and anything under them is
 * hidden, so a burn-in stays inside the frame's safe area. The insets are
 * generous rounded fractions of the frame rather than YouTube's exact
 * figures, which move with each app release and screen.
 *
 * Placement is the class's, not each kind's: a burn-in names a region, and
 * a frame's regions never overlap, so two burn-ins on screen together never
 * cover each other (`__tests__/placement.test.ts`). Each kind lays itself
 * out from the regions of the frame it is drawn for, so the same design
 * draws in either.
 *
 * Type is sized for a frame whose shorter side is 1080 px, as both are:
 * `typeScale` is the shorter side over 1080, so a caption reads at the same
 * size against the frame's shorter side whichever way the frame is turned.
 */

export type Box = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/** A frame's size in pixels. */
export type FrameSize = { readonly width: number; readonly height: number }

/** The 9:16 short. */
export const PORTRAIT = { width: 1080, height: 1920 } as const

/** The 16:9 video. */
export const LANDSCAPE = { width: 1920, height: 1080 } as const

/** The frames burn-ins are drawn for. */
export const FRAMES: ReadonlyArray<FrameSize> = [PORTRAIT, LANDSCAPE]

/** The bands a burn-in may draw in, in the order a clash names them. */
export const REGION_NAMES = ["header", "body", "lower-third", "gutter"] as const
export type Region = (typeof REGION_NAMES)[number]

export type Geometry = {
  readonly frame: FrameSize
  /** Where YouTube draws nothing over the video. */
  readonly safeArea: Box
  readonly regions: Readonly<Record<Region, Box>>
  /** The frame's shorter side over 1080: what type sizes are multiplied by. */
  readonly typeScale: number
}

type Insets = {
  readonly top: number
  readonly right: number
  readonly bottom: number
  readonly left: number
}

const safeAreaOf = (frame: FrameSize, insets: Insets): Box => ({
  x: insets.left,
  y: insets.top,
  width: frame.width - insets.left - insets.right,
  height: frame.height - insets.top - insets.bottom,
})

const typeScaleOf = (frame: FrameSize): number =>
  Math.min(frame.width, frame.height) / 1080

/** Each inset of the 1080x1920 short, in its pixels, and why it is there. */
const PORTRAIT_INSETS = {
  /** 8%: the search and menu buttons along the top. */
  top: 154,
  /** 15%: the like, comment, share and sound column on the right. */
  right: 162,
  /** 20%: the title, channel, subscribe button and sound line. */
  bottom: 384,
  /** 6%: a margin so nothing touches the edge. */
  left: 65,
} as const

const PORTRAIT_SAFE = safeAreaOf(PORTRAIT, PORTRAIT_INSETS)

/**
 * The short's bands:
 *
 * - `header`: the band above the picture, where a scene's kicker, headline
 *   and line sit, where the Build Journal shorts have always had them
 *   (54 px in, above the picture at 250 px). It reaches into the safe
 *   area's top and right insets, as those shorts' headers do; a header
 *   design that must clear YouTube's top buttons keeps to its safe part.
 * - `body`: the picture's window below it, down to the lower third, where a
 *   card's text sits.
 * - `lower-third`: the safe area's bottom band, where captions sit.
 * - `gutter`: the strip of ground left of the picture's window, where the
 *   authorship mark stays small between its intro and its end card. Like the header it is
 *   outside the safe area's left margin; nothing of YouTube's is drawn there.
 */
const PORTRAIT_GEOMETRY: Geometry = {
  frame: PORTRAIT,
  safeArea: PORTRAIT_SAFE,
  regions: {
    header: { x: 54, y: 40, width: 972, height: 210 },
    body: { x: 54, y: 250, width: 972, height: 1000 },
    "lower-third": {
      x: PORTRAIT_SAFE.x,
      y: 1250,
      width: PORTRAIT_SAFE.width,
      height: PORTRAIT_SAFE.y + PORTRAIT_SAFE.height - 1250,
    },
    gutter: { x: 6, y: 250, width: 42, height: 1000 },
  },
  typeScale: typeScaleOf(PORTRAIT),
}

/**
 * Each inset of the 1920x1080 video, in its pixels, and why it is there.
 * YouTube's landscape player draws a title band along the top and the
 * progress bar and controls along the bottom, and nothing down either side.
 * These are this slice's call (SFEED11), rounded up from the player as it
 * draws today; they can be tuned, as a new geometry, once a video shows
 * them too tight or too loose.
 */
const LANDSCAPE_INSETS = {
  /** 8%: the title, the channel's picture and the buttons beside them. */
  top: 86,
  /** 5%: a margin so nothing touches the edge. */
  right: 96,
  /** 12%: the progress bar and the row of controls under it. */
  bottom: 130,
  /** 5%: a margin so nothing touches the edge. */
  left: 96,
} as const

const LANDSCAPE_SAFE = safeAreaOf(LANDSCAPE, LANDSCAPE_INSETS)

/** Where the 16:9 video's lower third starts: room for two rows of captions. */
const LANDSCAPE_LOWER_THIRD_Y = 700

/**
 * The 16:9 video's bands, the short's turned on its side:
 *
 * - `header`: across the top of the safe area's width, as deep as the
 *   short's (40 px down, 210 px deep), so a scene's kicker, headline and
 *   line sit at the same depths; like the short's it reaches into the top
 *   inset.
 * - `body`: the safe area's width below it, down to the lower third.
 * - `lower-third`: the safe area's bottom 250 px, which holds a caption's
 *   two rows in any look above its lift (`captions/layout`).
 * - `gutter`: a strip in the left margin beside the body, as on the short.
 */
const LANDSCAPE_GEOMETRY: Geometry = {
  frame: LANDSCAPE,
  safeArea: LANDSCAPE_SAFE,
  regions: {
    header: {
      x: LANDSCAPE_SAFE.x,
      y: 40,
      width: LANDSCAPE_SAFE.width,
      height: 210,
    },
    body: {
      x: LANDSCAPE_SAFE.x,
      y: 250,
      width: LANDSCAPE_SAFE.width,
      height: LANDSCAPE_LOWER_THIRD_Y - 250,
    },
    "lower-third": {
      x: LANDSCAPE_SAFE.x,
      y: LANDSCAPE_LOWER_THIRD_Y,
      width: LANDSCAPE_SAFE.width,
      height:
        LANDSCAPE_SAFE.y + LANDSCAPE_SAFE.height - LANDSCAPE_LOWER_THIRD_Y,
    },
    gutter: { x: 48, y: 250, width: 42, height: LANDSCAPE_LOWER_THIRD_Y - 250 },
  },
  typeScale: typeScaleOf(LANDSCAPE),
}

const GEOMETRIES: ReadonlyArray<Geometry> = [
  PORTRAIT_GEOMETRY,
  LANDSCAPE_GEOMETRY,
]

const same = (a: FrameSize, b: FrameSize): boolean =>
  a.width === b.width && a.height === b.height

/** Why burn-ins can't be drawn into `frame`; null when they can. */
export const frameProblem = (frame: FrameSize): string | null =>
  GEOMETRIES.some((g) => same(g.frame, frame))
    ? null
    : `burn-ins are drawn for ${FRAMES.map((f) => `${f.width}x${f.height}`).join(" or ")}, not ${frame.width}x${frame.height}`

/** The frame's safe area and regions; throws for a frame burn-ins aren't drawn for. */
export function geometryOf(frame: FrameSize): Geometry {
  const found = GEOMETRIES.find((g) => same(g.frame, frame))
  if (found === undefined) throw new Error(frameProblem(frame) ?? "no frame")
  return found
}

/** Whether two boxes share any area; touching edges do not. */
export const overlaps = (a: Box, b: Box): boolean =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height

/** Whether `inner` lies wholly inside `outer`. */
export const inside = (inner: Box, outer: Box): boolean =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y + inner.height <= outer.y + outer.height
