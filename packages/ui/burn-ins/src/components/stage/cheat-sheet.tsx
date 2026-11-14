import type { JSX } from "react"
import { Badge } from "@burn-ins/components/stage/badge"
import { Stamp } from "@burn-ins/components/stage/card"
import { TextLayer } from "@burn-ins/components/stage/text"
import type { Units } from "@burn-ins/components/stage/units"
import { COMMAND_TYPE, type CheatSheetFrame } from "@burn-ins/lib/cheat-sheet"
import { INK } from "@burn-ins/lib/journal"
import { MONO_FAMILY } from "@burn-ins/lib/mono"

/** The cheat sheet: its heading, then each row that has appeared. */
export const CheatSheetLayer = ({
  frame,
  units,
}: {
  frame: CheatSheetFrame
  units: Units
}): JSX.Element => {
  const { cq, placed } = units
  return (
    <>
      <TextLayer frame={frame.heading} units={units} />
      <Stamp stamp={frame.stamp} units={units} />
      {frame.rows.map((r) => (
        <div key={r.row} className="bi-badge" style={{ opacity: r.opacity }}>
          <div
            className="bi-panel"
            style={{
              ...placed(r.panel),
              background: INK.panel,
              border: `${cq(2)} solid ${INK.edge}`,
              borderRadius: cq(10),
            }}
          />
          <TextLayer
            frame={{
              panels: [],
              blocks: r.note === null ? [r.task] : [r.task, r.note],
            }}
            units={units}
          />
          <div
            className="bi-text bi-mono"
            style={{
              left: cq(r.command.x),
              top: cq(r.command.y),
              color: COMMAND_TYPE.colour,
              fontFamily: MONO_FAMILY,
              fontWeight: 500,
              fontSize: cq(COMMAND_TYPE.sizePx),
              lineHeight: cq(COMMAND_TYPE.lineHeightPx),
            }}
          >
            {r.command.text}
          </div>
          {r.badge === null ? null : <Badge mark={r.badge} units={units} />}
        </div>
      ))}
    </>
  )
}
