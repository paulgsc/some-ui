/**
 * The preview mark (SFEED12, #2757): a template's preview says on every
 * frame that it is a preview of sample data, never an episode. Design
 * `plate-v1`: the words on one row, in capitals, on a dark plate with an
 * amber edge, at the left of the frame's foot (`./geometry`'s `foot`).
 *
 * The foot is the strip under the safe area, inside the band a stage leaves
 * empty for captions (`captions/space`) and below the lower third, where
 * captions are drawn, so the mark covers neither what the stage shows nor a
 * caption. YouTube draws its title there, which is no loss: a preview is
 * never uploaded.
 *
 * It takes no params: the words are the words table's
 * (`WORDS.previewMark`), and the renderer adds the mark to a preview's cut
 * alone (`@some-ui/video-render`'s `previewOf`), never to an episode's. The
 * text never changes, so the frame is the same at every moment.
 */

import { z } from "zod"

import type { Geometry } from "./geometry"
import type { TextFrame } from "./journal"
import type { Parsed } from "./parsed"
import { barlow, setText, widthOf, type TextStyle } from "./text"
import { WORDS } from "./words"

export const PREVIEW_MARK_DESIGNS = ["plate-v1"] as const

/** Nothing: the mark says the same on every preview. */
export const PreviewMarkParamsSchema = z.strictObject({})

/** Video colours, not the app's, so literals. */
const INK = {
  plate: "#14100c",
  edge: "#f2b44a",
  text: "#f6d79a",
} as const

/** In the frame's pixels; both frames' shorter side is 1080 (`./geometry`). */
const SIZE_PX = 34
const PAD_X = 26
const PAD_Y = 14
const EDGE_PX = 3

/** The mark, set at the left of the foot and centred down it. */
export function drawPreviewMark(
  _params: z.infer<typeof PreviewMarkParamsSchema>,
  g: Geometry
): Parsed<TextFrame> {
  const foot = g.regions.foot
  const style: TextStyle = {
    ...barlow(800, SIZE_PX, INK.text, 1.2),
    uppercase: true,
  }
  const text = WORDS.previewMark
  const textWidth = Math.ceil(widthOf(text, style))
  const height = Math.ceil(style.sizePx * style.lineHeight + 2 * PAD_Y)
  const width = textWidth + 2 * PAD_X
  if (width > foot.width || height > foot.height)
    return { ok: false, problems: ["the preview mark doesn't fit the foot"] }
  const plate = {
    x: foot.x,
    y: foot.y + Math.floor((foot.height - height) / 2),
    width,
    height,
  }
  const block = setText(
    text,
    style,
    { x: plate.x + PAD_X, y: plate.y + PAD_Y, width: textWidth },
    1
  )
  if (block === null)
    return { ok: false, problems: ["the preview mark doesn't fit the foot"] }
  return {
    ok: true,
    value: {
      panels: [
        {
          box: plate,
          fill: INK.plate,
          edge: INK.edge,
          edgePx: EDGE_PX,
          radiusPx: height / 2,
        },
      ],
      blocks: [block],
    },
  }
}
