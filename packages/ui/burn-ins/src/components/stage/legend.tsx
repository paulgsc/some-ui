import type { JSX } from "react"
import { Badge } from "@burn-ins/components/stage/badge"
import { Stamp } from "@burn-ins/components/stage/card"
import { TextLayer } from "@burn-ins/components/stage/text"
import type { Units } from "@burn-ins/components/stage/units"
import type { LegendFrame } from "@burn-ins/lib/legend"

/** The legend: its heading, each badge beside its meaning, and the stamp. */
export const LegendLayer = ({
  frame,
  units,
}: {
  frame: LegendFrame
  units: Units
}): JSX.Element => (
  <>
    <TextLayer frame={frame.heading} units={units} />
    <Stamp stamp={frame.stamp} units={units} />
    {frame.rows.map((r) => (
      <div key={r.row} className="bi-badge" style={{ opacity: r.opacity }}>
        <Badge mark={r.badge} units={units} />
        <TextLayer frame={{ panels: [], blocks: [r.meaning] }} units={units} />
      </div>
    ))}
  </>
)
