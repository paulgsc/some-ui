import type { JSX } from "react"
import { cn } from "@some-ui/core-utils"

/**
 * The Some UI mark: a seven-cell honeycomb, one core cell ringed by six.
 *
 * Same geometry as public/favicon.svg (flat-top hexagons of circumradius 9,
 * neighbour centres 20 apart on the 30/90/…/330 degree spokes, a 64 box);
 * keep the two in step, since the favicon cannot import this. The ring is at
 * reduced opacity so the core reads as the centre when both share a colour.
 */

const RING_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [0, -20],
  [17.321, -10],
  [17.321, 10],
  [0, 20],
  [-17.321, 10],
  [-17.321, -10],
]

const CELL = "M9 0 4.5 7.794 -4.5 7.794 -9 0 -4.5 -7.794 4.5 -7.794Z"

/** The honey pair from public/favicon.svg. Fixed, because it is the brand. */
const BRAND_RING = "#f59e0b"
const BRAND_CORE = "#fde68a"

type HexCombMarkProps = {
  className?: string
  /**
   * `brand` paints the favicon's honey pair, unchanged by theme: use it where
   * the mark is shown *as the brand*. `current` inherits `currentColor`, where
   * the mark acts as a UI glyph (the sidebar's Home item, among lucide icons).
   */
  tone?: "brand" | "current"
  /**
   * Rendered as a labelled image. Leave it off wherever adjacent text already
   * names the thing (the wordmark, the "Home" label).
   */
  title?: string
}

export const HexCombMark = ({
  className,
  tone = "current",
  title,
}: HexCombMarkProps): JSX.Element => {
  const isBrand = tone === "brand"

  return (
    <svg
      viewBox="0 0 64 64"
      className={cn("size-6", className)}
      fill="currentColor"
      {...(title ? { role: "img" } : { "aria-hidden": true })}
    >
      {title && <title>{title}</title>}
      <g transform="translate(32 32)">
        {RING_OFFSETS.map(([x, y]) => (
          <path
            key={`${x},${y}`}
            d={CELL}
            transform={`translate(${x} ${y})`}
            // Monochrome needs the ring knocked back for the core to read as a
            // centre at all; the brand pair already separates them by hue.
            {...(isBrand ? { fill: BRAND_RING } : { opacity: 0.55 })}
          />
        ))}
        <path d={CELL} {...(isBrand ? { fill: BRAND_CORE } : {})} />
      </g>
    </svg>
  )
}
