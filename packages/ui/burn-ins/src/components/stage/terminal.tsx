import type { CSSProperties, JSX } from "react"
import { Badge } from "@burn-ins/components/stage/badge"
import { Stamp } from "@burn-ins/components/stage/card"
import { TextLayer } from "@burn-ins/components/stage/text"
import type { Units } from "@burn-ins/components/stage/units"
import { INK } from "@burn-ins/lib/journal"
import { MONO_FAMILY } from "@burn-ins/lib/mono"
import { TERMINAL_TYPE, type TerminalFrame } from "@burn-ins/lib/terminal"

/**
 * The terminal card: its heading, then its window, title bar and the lines
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
  const { cq, placed } = units
  const mono = (sizePx: number): CSSProperties => ({
    fontFamily: MONO_FAMILY,
    fontWeight: 500,
    fontSize: cq(sizePx),
    lineHeight: cq(
      sizePx * (TERMINAL_TYPE.lineHeightPx / TERMINAL_TYPE.sizePx)
    ),
  })
  const w = frame.window
  return (
    <>
      <TextLayer frame={frame.heading} units={units} />
      <Stamp stamp={frame.stamp} units={units} />
      <div
        className="bi-panel"
        style={{
          ...placed(w.box),
          background: w.fill,
          border: `${cq(w.edgePx)} solid ${w.edge}`,
          borderRadius: cq(w.radiusPx),
        }}
      />
      <div
        className="bi-panel"
        style={{ ...placed(frame.rule), background: w.edge }}
      />
      {frame.dots.map((d) => (
        <div
          key={d.x}
          className="bi-panel"
          style={{ ...placed(d), background: w.edge, borderRadius: "50%" }}
        />
      ))}
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
            {r.spans.map((s) => (
              <span key={`${s.colour}${s.text}`} style={{ color: s.colour }}>
                {s.text}
              </span>
            ))}
          </div>
        </div>
      ))}
    </>
  )
}
