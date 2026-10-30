import type { JSX } from "react"
import { AuthorshipLayer } from "@burn-ins/components/stage/authorship"
import { Caption } from "@burn-ins/components/stage/captions"
import { GameCardLayer } from "@burn-ins/components/stage/game-card"
import { TextLayer } from "@burn-ins/components/stage/text"
import { placed } from "@burn-ins/components/stage/units"
import type { BurnInFrame } from "@burn-ins/lib/burn-in"
import { THEMES } from "@burn-ins/lib/captions/theme"
import { REGIONS, SAFE_AREA } from "@burn-ins/lib/geometry"
import { assertNever } from "@some-ui/intent-kit"

import "./index.css"

const Layer = ({ frame }: { frame: BurnInFrame }): JSX.Element | null => {
  switch (frame.kind) {
    case "captions": {
      return frame.frame.caption === null ? null : (
        <Caption frame={frame.frame} theme={THEMES[frame.design]} />
      )
    }
    case "headline":
    case "card": {
      return <TextLayer frame={frame.frame} />
    }
    case "authorship": {
      return <AuthorshipLayer frame={frame.frame} />
    }
    case "game-card": {
      return <GameCardLayer frame={frame.frame} />
    }
    default: {
      return assertNever(frame)
    }
  }
}

/**
 * One moment of a video with what is drawn into it: the 9:16 picture, each
 * burn-in's frame as the frame model gives it, and, if asked, the outline of
 * where YouTube draws nothing over it and of each region. It only reads the
 * frames; time lives in whoever computes them.
 *
 * `bare` is the recorder's: no ground, no edge, nothing but the burn-ins, on
 * a stage as wide as its container (1080 px for a 1080x1920 recording).
 * `ground` paints the video's own ground behind them, as a viewer saw it.
 */
export const BurnInStage = ({
  frames,
  outline = false,
  bare = false,
  ground,
  label,
}: {
  frames: ReadonlyArray<BurnInFrame>
  outline?: boolean
  bare?: boolean
  ground?: string
  label: string
}): JSX.Element => (
  <div
    className={
      bare ? "bi-stage" : "bi-stage bg-muted border-border rounded-xl border"
    }
    style={ground === undefined ? undefined : { background: ground }}
    role="img"
    aria-label={label}
  >
    {outline ? (
      <>
        <div
          className="bi-outline"
          style={placed(SAFE_AREA)}
          aria-hidden="true"
        />
        {Object.values(REGIONS).map((box) => (
          <div
            key={`${box.x},${box.y}`}
            className="bi-region"
            style={placed(box)}
            aria-hidden="true"
          />
        ))}
      </>
    ) : null}
    {frames.map((frame, i) => (
      <Layer key={`${frame.kind}-${i}`} frame={frame} />
    ))}
  </div>
)
