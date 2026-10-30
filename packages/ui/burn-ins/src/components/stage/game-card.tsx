import type { JSX } from "react"
import { TextLayer } from "@burn-ins/components/stage/text"
import { placed } from "@burn-ins/components/stage/units"
import type { GameCardFrame } from "@burn-ins/lib/game-card"

/**
 * A game card on screen: its panel and words, then its glyphs (a scenario's
 * icon, the arrows of a chain), each stroked in a 24x24 box as the scenario
 * catalog draws its icons.
 */
export const GameCardLayer = ({
  frame,
}: {
  frame: GameCardFrame
}): JSX.Element => (
  <>
    <TextLayer frame={frame} />
    {frame.glyphs.map((g) => (
      <svg
        key={`${g.box.x},${g.box.y}`}
        className="bi-glyph"
        style={placed(g.box)}
        viewBox="0 0 24 24"
        fill="none"
        stroke={g.colour}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {g.paths.map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
    ))}
  </>
)
