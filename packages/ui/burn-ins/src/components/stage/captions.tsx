import type { CSSProperties, JSX } from "react"
import { cq, placed, withAlpha } from "@burn-ins/components/stage/units"
import type { CaptionFrame } from "@burn-ins/lib/captions/frame"
import { popLook } from "@burn-ins/lib/captions/frame"
import type { CaptionTheme } from "@burn-ins/lib/captions/theme"

/** A caption as the frame model puts it up. */
export const Caption = ({
  frame,
  theme,
}: {
  frame: Extract<CaptionFrame, { caption: number }>
  theme: CaptionTheme
}): JSX.Element => {
  const { font, colours, plate, effects } = theme
  const text: CSSProperties = {
    fontFamily: font.family,
    fontWeight: font.weight,
    fontSize: cq(frame.layout.fontPx),
    lineHeight: cq(frame.layout.lineHeightPx),
    letterSpacing: `${font.letterSpacingEm}em`,
    textTransform: font.uppercase ? "uppercase" : "none",
  }
  const plateStyle: CSSProperties =
    plate === null
      ? {}
      : {
          background: withAlpha(plate.colour, plate.opacity),
          borderRadius: cq(plate.radiusPx),
          padding: `${cq(plate.padYPx)} ${cq(plate.padXPx)}`,
        }
  return (
    <div className="cap-block" style={placed(frame.layout.box)}>
      <div style={{ ...text, ...plateStyle }}>
        {frame.rows.map((row) => (
          <div key={row[0]?.startMs} className="cap-row">
            {row.map((word, w) => {
              const look = popLook(word.pop)
              const style: CSSProperties = {
                color:
                  effects.highlight && word.state === "now"
                    ? colours.highlight
                    : colours.text,
                opacity: look.opacity,
                transform: `scale(${look.scale.toFixed(4)})`,
                ...(theme.strokePx > 0
                  ? {
                      WebkitTextStroke: `${cq(theme.strokePx)} ${colours.stroke}`,
                    }
                  : {}),
              }
              return (
                <span key={word.startMs}>
                  {w > 0 ? " " : null}
                  <span
                    className="cap-word"
                    data-state={word.state}
                    style={style}
                  >
                    {word.text}
                  </span>
                </span>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
