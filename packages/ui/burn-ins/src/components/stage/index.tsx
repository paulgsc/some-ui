import type { CSSProperties, JSX } from "react"
import { AuthorshipLayer } from "@burn-ins/components/stage/authorship"
import { Caption } from "@burn-ins/components/stage/captions"
import { GameCardLayer } from "@burn-ins/components/stage/game-card"
import { TextLayer } from "@burn-ins/components/stage/text"
import { unitsOf, type Units } from "@burn-ins/components/stage/units"
import type { BurnInFrame } from "@burn-ins/lib/burn-in"
import type { Geometry } from "@burn-ins/lib/geometry"
import { assertNever } from "@some-ui/intent-kit"

import "./index.css"

const Layer = ({
  frame,
  units,
}: {
  frame: BurnInFrame
  units: Units
}): JSX.Element | null => {
  switch (frame.kind) {
    case "captions": {
      return frame.frame.caption === null ? null : (
        <Caption frame={frame.frame} theme={frame.theme} units={units} />
      )
    }
    case "headline":
    case "card": {
      return <TextLayer frame={frame.frame} units={units} />
    }
    case "authorship": {
      return <AuthorshipLayer frame={frame.frame} units={units} />
    }
    case "game-card": {
      return <GameCardLayer frame={frame.frame} units={units} />
    }
    default: {
      return assertNever(frame)
    }
  }
}

/** The stage's style: its frame's shape, and the video's ground if asked. */
type StageStyle = CSSProperties & { readonly "--bi-aspect": string }

/**
 * One moment of a video with what is drawn into it: the picture, in the
 * shape of the frame the burn-ins were prepared for (`geometry`), each
 * burn-in's frame as the frame model gives it, and, if asked, the outline of
 * where YouTube draws nothing over it and of each region. It only reads the
 * frames; time lives in whoever computes them.
 *
 * `bare` is the recorder's: no ground, no edge, nothing but the burn-ins, on
 * a stage as wide as its container (the frame's width for a recording).
 * `ground` paints the video's own ground behind them, as a viewer saw it.
 */
export const BurnInStage = ({
  frames,
  geometry,
  outline = false,
  bare = false,
  ground,
  label,
}: {
  frames: ReadonlyArray<BurnInFrame>
  geometry: Geometry
  outline?: boolean
  bare?: boolean
  ground?: string
  label: string
}): JSX.Element => {
  const units = unitsOf(geometry.frame)
  const style: StageStyle = {
    "--bi-aspect": `${geometry.frame.width} / ${geometry.frame.height}`,
    ...(ground === undefined ? {} : { background: ground }),
  }
  return (
    <div
      className={
        bare ? "bi-stage" : "bi-stage bg-muted border-border rounded-xl border"
      }
      style={style}
      role="img"
      aria-label={label}
    >
      {outline ? (
        <>
          <div
            className="bi-outline"
            style={units.placed(geometry.safeArea)}
            aria-hidden="true"
          />
          {Object.values(geometry.regions).map((box) => (
            <div
              key={`${box.x},${box.y}`}
              className="bi-region"
              style={units.placed(box)}
              aria-hidden="true"
            />
          ))}
        </>
      ) : null}
      {frames.map((frame, i) => (
        <Layer key={`${frame.kind}-${i}`} frame={frame} units={units} />
      ))}
    </div>
  )
}
