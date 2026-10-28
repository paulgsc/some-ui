import type { CSSProperties, JSX } from "react"
import type { CaptionFrame } from "@captions/lib/frame"
import { clamp01, popLook } from "@captions/lib/frame"
import { FRAME, SAFE_AREA, type Box } from "@captions/lib/layout"
import type { CaptionTheme } from "@captions/lib/theme"

import "./index.css"

/** Frame pixels (of 1080 across) as container units of the stage. */
const cq = (px: number): string => `${((px * 100) / FRAME.width).toFixed(4)}cqw`

const placed = (box: Box): CSSProperties => ({
  left: cq(box.x),
  top: cq(box.y),
  width: cq(box.width),
  height: cq(box.height),
})

/** A colour with an opacity, as #rrggbbaa. */
const withAlpha = (hex: string, opacity: number): string =>
  `${hex}${Math.round(clamp01(opacity) * 255)
    .toString(16)
    .padStart(2, "0")}`

const Caption = ({
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

/**
 * One frame of a short with its subtitles: the 9:16 picture, the caption the
 * frame model puts up at this moment, and, if asked, the outline of where
 * YouTube draws nothing over it. It only reads the frame; time lives in
 * whoever computes it.
 */
export const CaptionStage = ({
  frame,
  theme,
  outline = false,
  label,
}: {
  frame: CaptionFrame
  theme: CaptionTheme
  outline?: boolean
  label: string
}): JSX.Element => (
  <div
    className="cap-stage bg-muted border-border rounded-xl border"
    role="img"
    aria-label={label}
    data-caption={frame.caption ?? "none"}
  >
    {outline ? (
      <div className="cap-safe" style={placed(SAFE_AREA)} aria-hidden="true" />
    ) : null}
    {frame.caption === null ? null : <Caption frame={frame} theme={theme} />}
  </div>
)
