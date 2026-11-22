import type { JSX } from "react"
import { Stamp } from "@burn-ins/components/stage/card"
import { TextLayer } from "@burn-ins/components/stage/text"
import { withAlpha, type Units } from "@burn-ins/components/stage/units"
import type { BarsFrame } from "@burn-ins/lib/bars"
import type { TextBlock } from "@burn-ins/lib/text"

/**
 * The bars card: its heading, legend and axis, each row that has appeared,
 * and the stamp. A row fades in by its own colours, never by a layer's
 * opacity around its rounded parts (C312).
 */
export const BarsLayer = ({
  frame,
  units,
}: {
  frame: BarsFrame
  units: Units
}): JSX.Element => (
  <>
    <TextLayer frame={frame.heading} units={units} />
    <TextLayer frame={frame.axis} units={units} />
    <TextLayer frame={frame.legend} units={units} />
    <Stamp stamp={frame.stamp} units={units} />
    {frame.rows.map((r) => {
      const faded = (colour: string): string => withAlpha(colour, r.opacity)
      const fade = (b: TextBlock): TextBlock => ({
        ...b,
        style: { ...b.style, colour: faded(b.style.colour) },
      })
      return (
        <TextLayer
          key={r.row}
          frame={{
            panels: r.parts.map((p) => ({
              ...p,
              fill: faded(p.fill),
              edge: faded(p.edge),
            })),
            blocks: (r.note === null ? [r.label] : [r.label, r.note]).map(fade),
          }}
          units={units}
        />
      )
    })}
  </>
)
