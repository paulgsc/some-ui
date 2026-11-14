import type { JSX } from "react"
import { withAlpha, type Units } from "@burn-ins/components/stage/units"
import {
  GLYPH_STROKE,
  GLYPHS,
  type BadgeMark,
  type StatusBadgeFrame,
} from "@burn-ins/lib/badge"

/** How strongly an open badge's pill is tinted with its colour. */
const PILL_TINT = 0.18

/**
 * A status badge: its glyph drawn from paths, and while it announces itself
 * a tinted pill behind it with its definition, shown as far as it is open.
 */
const Badge = ({
  mark,
  units: { cq, placed },
}: {
  mark: BadgeMark
  units: Units
}): JSX.Element => (
  <div
    className="bi-badge"
    data-badge={mark.state}
    style={{ opacity: mark.opacity }}
  >
    {mark.open === null ? null : (
      <>
        <div
          className="bi-panel"
          style={{
            ...placed(mark.open.pill),
            background: withAlpha(mark.colour, PILL_TINT * mark.open.amount),
            borderRadius: cq(mark.open.pill.height / 2),
          }}
        />
        <div
          className="bi-text"
          style={{
            ...placed({
              ...mark.open.label.box,
              width: mark.open.shownPx,
            }),
            overflow: "hidden",
            opacity: mark.open.amount,
            color: mark.open.label.style.colour,
            fontFamily: mark.open.label.style.family,
            fontWeight: mark.open.label.style.weight,
            fontSize: cq(mark.open.label.style.sizePx),
            lineHeight: cq(
              mark.open.label.style.sizePx * mark.open.label.style.lineHeight
            ),
          }}
        >
          {mark.open.label.rows[0]}
        </div>
      </>
    )}
    <svg
      className="bi-glyph"
      style={placed(mark.glyph)}
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      {GLYPHS[mark.state].map((p) => (
        <path
          key={p.d}
          d={p.d}
          fill={p.paint === "fill" ? mark.colour : "none"}
          stroke={p.paint === "stroke" ? mark.colour : "none"}
          strokeWidth={GLYPH_STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  </div>
)

export const StatusBadgeLayer = ({
  frame,
  units,
}: {
  frame: StatusBadgeFrame
  units: Units
}): JSX.Element => (
  <>
    {frame.marks.map((m) => (
      <Badge key={`${m.glyph.x},${m.glyph.y}`} mark={m} units={units} />
    ))}
  </>
)
