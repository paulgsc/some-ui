import type { CSSProperties, JSX } from "react"
import { cq, placed } from "@burn-ins/components/stage/units"
import type { TextFrame } from "@burn-ins/lib/journal"

/** A text burn-in's panels and blocks, each where the frame model set it. */
export const TextLayer = ({ frame }: { frame: TextFrame }): JSX.Element => (
  <>
    {frame.panels.map((p) => (
      <div
        key={`${p.box.x},${p.box.y}`}
        className="bi-panel"
        style={{
          ...placed(p.box),
          background: p.fill,
          border: `${cq(p.edgePx)} solid ${p.edge}`,
          borderRadius: cq(p.radiusPx),
        }}
      />
    ))}
    {frame.blocks.map((b) => {
      const style: CSSProperties = {
        ...placed(b.box),
        color: b.style.colour,
        fontFamily: b.style.family,
        fontWeight: b.style.weight,
        fontSize: cq(b.style.sizePx),
        lineHeight: cq(b.style.sizePx * b.style.lineHeight),
        textTransform: b.style.uppercase ? "uppercase" : "none",
      }
      return (
        <div key={`${b.box.x},${b.box.y}`} className="bi-text" style={style}>
          {b.rows.map((row, i) => (
            <div key={i}>{row}</div>
          ))}
        </div>
      )
    })}
  </>
)
