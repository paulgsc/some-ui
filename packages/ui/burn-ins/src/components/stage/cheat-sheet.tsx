import type { JSX } from "react"
import { Badge } from "@burn-ins/components/stage/badge"
import { MonoCommand, Stamp } from "@burn-ins/components/stage/card"
import { TextLayer } from "@burn-ins/components/stage/text"
import { withAlpha, type Units } from "@burn-ins/components/stage/units"
import { COMMAND_TYPE, type CheatSheetFrame } from "@burn-ins/lib/cheat-sheet"
import { INK } from "@burn-ins/lib/journal"
import type { TextBlock } from "@burn-ins/lib/text"

/** The cheat sheet: its heading, then each row that has appeared. */
export const CheatSheetLayer = ({
  frame,
  units,
}: {
  frame: CheatSheetFrame
  units: Units
}): JSX.Element => {
  return (
    <>
      <TextLayer frame={frame.heading} units={units} />
      <Stamp stamp={frame.stamp} units={units} />
      {frame.rows.map((r) => {
        // Faded by its own colours, never a layer's opacity (C312).
        const faded = (colour: string): string => withAlpha(colour, r.opacity)
        const fade = (b: TextBlock): TextBlock => ({
          ...b,
          style: { ...b.style, colour: faded(b.style.colour) },
        })
        return (
          <div key={r.row} style={{ display: "contents" }}>
            <TextLayer
              frame={{
                panels: [
                  {
                    box: r.panel,
                    fill: faded(INK.panel),
                    edge: faded(INK.edge),
                    edgePx: 2,
                    radiusPx: 10,
                  },
                ],
                blocks: (r.note === null ? [r.task] : [r.task, r.note]).map(
                  fade
                ),
              }}
              units={units}
            />
            <MonoCommand
              at={r.command}
              type={COMMAND_TYPE}
              opacity={r.opacity}
              units={units}
            />
            {r.badge === null ? null : <Badge mark={r.badge} units={units} />}
          </div>
        )
      })}
    </>
  )
}
