import type { JSX } from "react"
import { monoType, type Units } from "@burn-ins/components/stage/units"
import { STAMP_COLOUR, STAMP_TYPE, type StampLine } from "@burn-ins/lib/cards"

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
      ...monoType(units, STAMP_TYPE.sizePx, STAMP_TYPE.lineHeightPx),
    }}
  >
    {stamp.text}
  </div>
)
