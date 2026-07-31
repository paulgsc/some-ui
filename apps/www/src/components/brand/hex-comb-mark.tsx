import type { JSX } from "react"
import { cn } from "some-ui-utils"

/**
 * The Some UI mark: a seven-cell honeycomb, one core cell ringed by six.
 *
 * Same geometry as public/favicon.svg — flat-top hexagons of circumradius 9
 * with neighbour centres 20 apart on the 30/90/…/330 degree spokes, inside a
 * 64 box. Keep the two in step; they are the same mark at different sizes,
 * and the favicon cannot import this file. (The 20 is sized for the favicon's
 * 16px worst case; see the note there. It costs nothing at the sizes this
 * component renders at, and matching matters more than optimising each.)
 *
 * Colour works differently here, though, and deliberately. The favicon is a
 * standalone file with no stylesheet to inherit from, so it hard-codes amber.
 * This draws in `currentColor` instead, so the mark takes the colour of
 * whatever it is placed in — the accent gradient on the landing hero, the
 * active/inactive sidebar foreground on the home button — and follows every
 * theme in the switcher without knowing any of them exist. The ring is drawn
 * at reduced opacity so the core still reads as the centre of a comb when
 * both are the one colour.
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
   * How the mark is coloured, which is a real choice and not a style knob.
   *
   * `brand` paints the honey pair the favicon uses, unchanged by theme — the
   * point of a brand mark is that it looks the same everywhere, and running it
   * through `--primary` means it turns up grey-blue in one theme and rose in
   * another. Use it where the mark is being shown *as the brand*.
   *
   * `current` inherits `currentColor` instead, for the places where the mark
   * is behaving as a UI glyph rather than a logo — the sidebar's Home item sits
   * in a row of lucide icons and has to pick up the same active/inactive
   * foreground they do, or it reads as a stray decoration.
   */
  tone?: "brand" | "current"
  /**
   * Rendered as a labelled image rather than decoration. Leave it off wherever
   * adjacent text already names the thing (the "Some UI" wordmark, the "Home"
   * nav label) — a mark that repeats its neighbour is noise to a screen
   * reader, not information.
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
