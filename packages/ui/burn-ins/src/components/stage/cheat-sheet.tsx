import type { JSX } from "react"
import { Badge } from "@burn-ins/components/stage/badge"
import { TextLayer } from "@burn-ins/components/stage/text"
import { withAlpha, type Units } from "@burn-ins/components/stage/units"
import { COMMAND_TYPE, type CheatSheetFrame } from "@burn-ins/lib/cheat-sheet"
import { INK } from "@burn-ins/lib/journal"
import { MONO_FAMILY } from "@burn-ins/lib/mono"
import type { TextBlock } from "@burn-ins/lib/text"

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
      {frame.rows.map((r) => {
        // A row fades in by its own colours, never by the opacity of a layer
        // around its bordered, rounded panel: a panel composited through a
        // layer below full opacity drew a corner pixel differently from one
        // recording to the next (C312).
        const faded = (colour: string): string => withAlpha(colour, r.opacity)
        const fade = (b: TextBlock): TextBlock => ({
          ...b,
          style: { ...b.style, colour: faded(b.style.colour) },
        })
        return (
          <div key={r.row} style={{ display: "contents" }}>
            <div
              className="bi-panel"
              style={{
                ...placed(r.panel),
                background: faded(INK.panel),
                border: `${cq(2)} solid ${faded(INK.edge)}`,
                borderRadius: cq(10),
              }}
            />
            <TextLayer
              frame={{
                panels: [],
                blocks: (r.note === null ? [r.task] : [r.task, r.note]).map(
                  fade
                ),
              }}
              units={units}
            />
            <div
              className="bi-text bi-mono"
              style={{
                left: cq(r.command.x),
                top: cq(r.command.y),
                color: faded(COMMAND_TYPE.colour),
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
        )
      })}
    </>
  )
}
