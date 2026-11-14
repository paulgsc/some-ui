import type { JSX } from "react"
import {
  monoType,
  withAlpha,
  type Units,
} from "@burn-ins/components/stage/units"
import {
  STAMP_COLOUR,
  STAMP_TYPE,
  type Command,
  type CommandType,
  type StampLine,
} from "@burn-ins/lib/cards"

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

/** A card's command, in the monospace, faded by its own colour (C312). */
export const MonoCommand = ({
  at,
  type,
  opacity,
  units,
}: {
  at: Command
  type: CommandType
  opacity: number
  units: Units
}): JSX.Element => (
  <div
    className="bi-text bi-mono"
    style={{
      left: units.cq(at.x),
      top: units.cq(at.y),
      color: withAlpha(type.colour, opacity),
      ...monoType(units, type.sizePx, type.lineHeightPx),
    }}
  >
    {at.text}
  </div>
)
