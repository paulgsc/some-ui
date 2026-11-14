import type { CSSProperties, JSX } from "react"
import { Badge } from "@burn-ins/components/stage/badge"
import { Stamp } from "@burn-ins/components/stage/card"
import { TextLayer } from "@burn-ins/components/stage/text"
import { monoType, type Units } from "@burn-ins/components/stage/units"
import { INK } from "@burn-ins/lib/journal"
import { TERMINAL_TYPE, type TerminalFrame } from "@burn-ins/lib/terminal"

/**
 * The terminal card: its heading and window, its title bar, and the lines
 * that have appeared, each a row of coloured runs where the frame model set
 * it, with its badge.
 */
export const TerminalLayer = ({
  frame,
  units,
}: {
  frame: TerminalFrame
  units: Units
}): JSX.Element => {
  const { cq } = units
  const mono = (sizePx: number): CSSProperties =>
    monoType(units, sizePx, sizePx * TERMINAL_TYPE.lineHeight)
  return (
    <>
      <TextLayer frame={frame.card} units={units} />
      <Stamp stamp={frame.stamp} units={units} />
      {frame.bar === null ? null : (
        <div
          className="bi-text"
          style={{
            left: cq(frame.bar.x),
            top: cq(frame.bar.y),
            color: INK.muted,
            ...mono(TERMINAL_TYPE.barSizePx),
          }}
        >
          {frame.bar.text}
        </div>
      )}
      {frame.rows.map((r) => (
        <div key={r.line} style={{ display: "contents" }}>
          {r.badge === null ? null : <Badge mark={r.badge} units={units} />}
          <div
            className="bi-text bi-mono"
            style={{
              left: cq(r.x),
              top: cq(r.y),
              opacity: r.opacity,
              ...mono(TERMINAL_TYPE.sizePx),
            }}
          >
            {r.spans.map((s, at) => (
              // A span's place in its line is its identity; two can read alike.
              // eslint-disable-next-line react/no-array-index-key
              <span key={at} style={{ color: s.colour }}>
                {s.text}
              </span>
            ))}
          </div>
        </div>
      ))}
    </>
  )
}
