import type { JSX } from "react"
import { Badge } from "@burn-ins/components/stage/badge"
import { Stamp } from "@burn-ins/components/stage/card"
import { TextLayer } from "@burn-ins/components/stage/text"
import { monoType, type Units } from "@burn-ins/components/stage/units"
import { GLYPH_STROKE } from "@burn-ins/lib/badge"
import { INK } from "@burn-ins/lib/journal"
import { ruleLineHeight, SIGNS, type RuleFrame } from "@burn-ins/lib/rule"

/**
 * The rule: its heading, each line that has appeared, its words in the
 * monospace and its signs and badges drawn as shapes, and the stamp.
 */
export const RuleLayer = ({
  frame,
  units,
}: {
  frame: RuleFrame
  units: Units
}): JSX.Element => {
  const { cq, placed } = units
  const type = monoType(units, frame.sizePx, ruleLineHeight(frame.sizePx))
  return (
    <>
      <TextLayer frame={frame.heading} units={units} />
      <Stamp stamp={frame.stamp} units={units} />
      {frame.rows.map((r) => (
        <div key={r.line} className="bi-badge" style={{ opacity: r.opacity }}>
          {r.pieces.map((p) =>
            p.kind === "words" ? (
              <div
                key={`w${p.x}`}
                className="bi-text bi-mono"
                style={{
                  left: cq(p.x),
                  top: cq(r.y),
                  color: p.colour,
                  ...type,
                }}
              >
                {p.text}
              </div>
            ) : p.kind === "sign" ? (
              <svg
                key={`s${p.box.x}`}
                className="bi-glyph"
                style={placed(p.box)}
                viewBox="0 0 16 16"
                aria-hidden="true"
              >
                <path
                  d={SIGNS[p.sign]}
                  fill="none"
                  stroke={INK.text}
                  strokeWidth={GLYPH_STROKE}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : null
          )}
          {r.badges.map((m) => (
            <Badge key={`b${m.glyph.x}`} mark={m} units={units} />
          ))}
        </div>
      ))}
    </>
  )
}
