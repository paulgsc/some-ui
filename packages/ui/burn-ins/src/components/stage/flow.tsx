import type { JSX } from "react"
import { Badge } from "@burn-ins/components/stage/badge"
import { MonoCommand, Stamp } from "@burn-ins/components/stage/card"
import { TextLayer } from "@burn-ins/components/stage/text"
import { withAlpha, type Units } from "@burn-ins/components/stage/units"
import { GLYPH_STROKE } from "@burn-ins/lib/badge"
import {
  ARROW_PATH,
  FLOW_COMMAND_TYPE,
  type FlowFrame,
} from "@burn-ins/lib/flow"
import { INK } from "@burn-ins/lib/journal"
import type { TextBlock } from "@burn-ins/lib/text"

/**
 * The flow: its heading, each step that has appeared with the arrow into
 * it, and the stamp. A step fades in by its own colours, never by a layer's
 * opacity around its bordered, rounded panel (C312).
 */
export const FlowLayer = ({
  frame,
  units,
}: {
  frame: FlowFrame
  units: Units
}): JSX.Element => {
  const { placed } = units
  return (
    <>
      <TextLayer frame={frame.heading} units={units} />
      <Stamp stamp={frame.stamp} units={units} />
      {frame.steps.map((s) => {
        const faded = (colour: string): string => withAlpha(colour, s.opacity)
        const fade = (b: TextBlock): TextBlock => ({
          ...b,
          style: { ...b.style, colour: faded(b.style.colour) },
        })
        return (
          <div key={s.step} style={{ display: "contents" }}>
            {s.arrow === null ? null : (
              <svg
                className="bi-glyph"
                style={{
                  ...placed(s.arrow),
                  transform: frame.down ? "rotate(90deg)" : undefined,
                }}
                viewBox="0 0 16 16"
                aria-hidden="true"
              >
                <path
                  d={ARROW_PATH}
                  fill="none"
                  stroke={faded(INK.muted)}
                  strokeWidth={GLYPH_STROKE}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
            <TextLayer
              frame={{
                panels: [
                  {
                    box: s.panel,
                    fill: faded(INK.panel),
                    edge: faded(INK.edge),
                    edgePx: 2,
                    radiusPx: 10,
                  },
                ],
                blocks: (s.note === null ? [s.label] : [s.label, s.note]).map(
                  fade
                ),
              }}
              units={units}
            />
            {s.command === null ? null : (
              <MonoCommand
                at={s.command}
                type={FLOW_COMMAND_TYPE}
                opacity={s.opacity}
                units={units}
              />
            )}
            {s.badge === null ? null : <Badge mark={s.badge} units={units} />}
          </div>
        )
      })}
    </>
  )
}
