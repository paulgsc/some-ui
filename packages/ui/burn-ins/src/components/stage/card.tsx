import type { CSSProperties, JSX } from "react"
import type { Units } from "@burn-ins/components/stage/units"
import { STAMP_COLOUR, STAMP_TYPE, type StampLine } from "@burn-ins/lib/cards"
import { MONO_FAMILY } from "@burn-ins/lib/mono"

/** The cards' monospace at `sizePx`, its rows `lineHeightPx` apart. */
export const monoStyle = (
  { cq }: Units,
  sizePx: number,
  lineHeightPx: number
): CSSProperties => ({
  fontFamily: MONO_FAMILY,
  fontWeight: 500,
  fontSize: cq(sizePx),
  lineHeight: cq(lineHeightPx),
})

/** A card's stamp, at the foot of its body: `as of <repo>@<commit> · <date>`. */
export const Stamp = ({
  stamp,
  units,
}: {
  stamp: StampLine
  units: Units
}): JSX.Element => (
  <div
    className="bi-text bi-mono"
    data-stamp=""
    style={{
      left: units.cq(stamp.box.x),
      top: units.cq(stamp.box.y),
      color: STAMP_COLOUR,
      ...monoStyle(units, STAMP_TYPE.sizePx, STAMP_TYPE.lineHeightPx),
    }}
  >
    {stamp.text}
  </div>
)
