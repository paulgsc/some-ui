/**
 * The frame every burn-in is drawn into, and where in it each may sit.
 *
 * YouTube draws its own controls over a Short: the title, channel and sound
 * along the bottom, and the like, comment and share column down the right.
 * Anything under them is hidden, so a burn-in stays inside `SAFE_AREA`. The
 * insets are generous rounded fractions of the frame rather than YouTube's
 * exact figures, which move with each app release and screen.
 *
 * Placement is the class's, not each kind's: a burn-in names a region, and
 * the regions here never overlap, so two burn-ins on screen together never
 * cover each other (`__tests__/placement.test.ts`).
 */

export const FRAME = { width: 1080, height: 1920 } as const

/** Each inset, in pixels of the 1080x1920 frame, and why it is there. */
const SAFE_INSETS = {
  /** 8%: the search and menu buttons along the top. */
  top: 154,
  /** 15%: the like, comment, share and sound column on the right. */
  right: 162,
  /** 20%: the title, channel, subscribe button and sound line. */
  bottom: 384,
  /** 6%: a margin so nothing touches the edge. */
  left: 65,
} as const

export type Box = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export const SAFE_AREA: Box = {
  x: SAFE_INSETS.left,
  y: SAFE_INSETS.top,
  width: FRAME.width - SAFE_INSETS.left - SAFE_INSETS.right,
  height: FRAME.height - SAFE_INSETS.top - SAFE_INSETS.bottom,
}

/**
 * The bands a burn-in may draw in.
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
export const REGIONS = {
  header: { x: 54, y: 40, width: 972, height: 210 },
  body: { x: 54, y: 250, width: 972, height: 1000 },
  "lower-third": {
    x: SAFE_AREA.x,
    y: 1250,
    width: SAFE_AREA.width,
    height: SAFE_AREA.y + SAFE_AREA.height - 1250,
  },
  gutter: { x: 6, y: 250, width: 42, height: 1000 },
} as const satisfies Record<string, Box>

export type Region = keyof typeof REGIONS

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
