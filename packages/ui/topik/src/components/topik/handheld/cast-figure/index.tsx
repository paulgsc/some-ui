import type { JSX } from "react"
import { cn } from "@some-ui/core-utils"
import type { FigureKey } from "@topik/lib/topik/core/cast"

import "./index.css"

type Art = {
  /** The silhouette, filled with the panel's ground. */
  body: JSX.Element
  /** Leaves, props and markings, over the body. */
  details: JSX.Element
  /** Blinks, as one group. */
  eyes: JSX.Element
  /** The mouth that talks: centre and radii of a filled ellipse. */
  mouth: readonly [cx: number, cy: number, rx: number, ry: number]
}

const FILL = "cast-figure-fill"
const ACCENT = "cast-figure-accent"
const INK = "cast-figure-ink"

/** Filled dots; a cheek or a highlight is not outlined, or the ink drowns it. */
const dots = (
  points: ReadonlyArray<readonly [number, number]>,
  r: number,
  className = INK
): JSX.Element => (
  <>
    {points.map(([cx, cy]) => (
      <circle
        key={`${cx},${cy}`}
        className={className}
        cx={cx}
        cy={cy}
        r={r}
        stroke={className === INK ? undefined : "none"}
      />
    ))}
  </>
)

/**
 * The cast, drawn on a 48-unit square (`core/cast`, docs/makjang/README.md,
 * "The cast, drawn"): a silhouette and one prop each, so two figures read
 * apart at a glance in any feeling's colours.
 */
const ART: Readonly<Record<FigureKey, Art>> = {
  heart: {
    body: (
      <path
        className={FILL}
        d="M24 15C19 9 9 11 9 23c0 11 7 20 15 20s15-9 15-20c0-12-10-14-15-8z"
      />
    ),
    details: (
      <>
        <path d="M24 15c-2 4-2.5 7-1.5 10" strokeWidth={1.5} />
        <path
          className={ACCENT}
          d="M24 15c1-5 5-8 10-7.5-1 4.5-5 7.5-10 7.5z"
        />
        {dots(
          [
            [15.5, 34.5],
            [32.5, 34.5],
          ],
          2,
          ACCENT
        )}
      </>
    ),
    eyes: dots(
      [
        [19, 28],
        [29, 28],
      ],
      2.1
    ),
    mouth: [24, 34.5, 2.6, 2.4],
  },
  heir: {
    body: (
      <path
        className={FILL}
        d="M24 13c-4 0-6 3-6 7 0 2-1 3-3 5-3 3-4 7-3 11 1.5 5 6.5 8 12 8s10.5-3 12-8c1-4 0-8-3-11-2-2-3-3-3-5 0-4-2-7-6-7z"
      />
    ),
    details: (
      <>
        <path
          className={ACCENT}
          d="M18 14 17 6l3.6 3.4L24 4.5l3.4 4.9L31 6l-1 8z"
        />
        <path d="M17.5 25.5q2.5-2 5 0M25.5 25.5q2.5-2 5 0" strokeWidth={1.5} />
      </>
    ),
    eyes: dots(
      [
        [20, 30],
        [28, 30],
      ],
      2
    ),
    mouth: [24, 36, 2.4, 2.2],
  },
  elder: {
    body: (
      <path
        className={FILL}
        d="M24 16c-9 0-16 5-16 13s7 14 16 14 16-6 16-14-7-13-16-13z"
      />
    ),
    details: (
      <>
        <path d="M24 13v-3.5" />
        <path
          className={ACCENT}
          d="M24 17c-3-1.5-7-1.5-9.5.5 2.5 2 6.5 2 9.5-.5zM24 17c3-1.5 7-1.5 9.5.5-2.5 2-6.5 2-9.5-.5zM24 17c-1.5-3-1.5-6 .5-8 1.5 2 1.5 5-.5 8z"
        />
        <path d="M15 23.5q3-1.2 6 .4M33 23.5q-3-1.2-6 .4" strokeWidth={1.6} />
        <circle cx={18.5} cy={29.5} r={4.3} strokeWidth={1.6} />
        <circle cx={29.5} cy={29.5} r={4.3} strokeWidth={1.6} />
        <path d="M22.8 29.5h2.4" strokeWidth={1.6} />
      </>
    ),
    eyes: dots(
      [
        [18.5, 29.5],
        [29.5, 29.5],
      ],
      1.6
    ),
    mouth: [24, 37.5, 2.4, 2.2],
  },
  rival: {
    body: (
      <path
        className={FILL}
        d="M21 11c8-1 13 5 13 13 0 9-5 16-14 20 2-6-3-10-4-17-1-8 0-15 5-16z"
      />
    ),
    details: (
      <>
        <path d="M23 10.5c0-3 2-5.5 5-6" />
        <path
          className={ACCENT}
          d="M16.5 12.5c2-3 8.5-3.5 11.5-1.5-3 2-8.5 2.5-11.5 1.5z"
        />
        <path d="M19 17.5l5 2M32 17.5l-5 2" strokeWidth={2} />
      </>
    ),
    eyes: dots(
      [
        [22, 22.5],
        [29, 22.5],
      ],
      2
    ),
    mouth: [26, 29.5, 2.2, 2],
  },
  aide: {
    body: (
      <path
        className={FILL}
        d="M24 8c1.6 0 2.8.9 3.7 2.5l11.8 23.2c1.9 3.8-.4 8.3-4.7 8.3H13.2c-4.3 0-6.6-4.5-4.7-8.3L20.3 10.5C21.2 8.9 22.4 8 24 8z"
      />
    ),
    details: (
      <>
        <path
          className={INK}
          d="M10 31h28l1.5 2.7c1.9 3.8-.4 8.3-4.7 8.3H13.2c-4.3 0-6.6-4.5-4.7-8.3z"
        />
        <path className={ACCENT} d="M24 31l-2.2 3 2.2 6.5 2.2-6.5z" />
        <rect
          x={16}
          y={21.5}
          width={6.5}
          height={5}
          rx={1.5}
          strokeWidth={1.6}
        />
        <rect
          x={25.5}
          y={21.5}
          width={6.5}
          height={5}
          rx={1.5}
          strokeWidth={1.6}
        />
        <path d="M22.5 24h3" strokeWidth={1.6} />
      </>
    ),
    eyes: dots(
      [
        [19.25, 24],
        [28.75, 24],
      ],
      1.5
    ),
    mouth: [24, 28.6, 2, 1.6],
  },
  friend: {
    body: <circle className={FILL} cx={24} cy={27} r={16} />,
    details: (
      <>
        <path d="M24 11.5V9" />
        <path
          className={ACCENT}
          d="M24 11.5c.5-4.5 4.5-7 9-6.5-1 4-4.5 6.5-9 6.5z"
        />
        {dots(
          [
            [14, 21],
            [34, 22],
            [32, 37.5],
            [15, 36.5],
          ],
          0.9
        )}
      </>
    ),
    eyes: <path d="M16.5 26.5q2.5-3.2 5 0M26.5 26.5q2.5-3.2 5 0" />,
    mouth: [24, 33, 3.4, 2.8],
  },
  kid: {
    body: (
      <path
        className={FILL}
        d="M24 44c-9-5-15-12-14.5-21 .3-6 5-9 10-8.5 2 .2 3.3.8 4.5.8s2.5-.6 4.5-.8c5-.5 9.7 2.5 10 8.5.5 9-5.5 16-14.5 21z"
      />
    ),
    details: (
      <>
        <path
          className={ACCENT}
          d="M14.5 16.5l4-5 3 3.5 2.5-6 2.5 6 3-3.5 4 5c-4 2.5-15 2.5-19 0z"
        />
        {dots(
          [
            [13.5, 25],
            [34.5, 25],
            [17, 36],
            [31, 36],
            [24, 40],
          ],
          0.8
        )}
      </>
    ),
    eyes: (
      <>
        {dots(
          [
            [19, 26],
            [29, 26],
          ],
          2.7
        )}
        {dots(
          [
            [19.9, 25.1],
            [29.9, 25.1],
          ],
          0.9,
          FILL
        )}
      </>
    ),
    mouth: [24, 32, 2, 2],
  },
  stranger: {
    body: (
      <path
        className={FILL}
        d="M24 14c9 0 16 6 16 15 0 8-7 14-16 14S8 37 8 29c0-9 7-15 16-15z"
      />
    ),
    details: (
      <>
        <path
          className={ACCENT}
          d="M9.5 35c4 4.5 25 4.5 29 0-1.8 4.8-7.6 8-14.5 8S11.3 39.8 9.5 35z"
        />
        <path className={INK} d="M15 20c0-7 4-10 9-10s9 3 9 10z" />
        <path d="M8.5 20.5h31" strokeWidth={3} />
      </>
    ),
    eyes: <path d="M17 26.5h4.5M26.5 26.5h4.5" strokeWidth={2.2} />,
    mouth: [24, 32, 2, 1.8],
  },
}

/** Staggered, so a panel of figures never blinks in unison. */
const BLINK_DELAY: Readonly<Record<FigureKey, string>> = {
  heart: "-0.4s",
  heir: "-2.9s",
  elder: "-1.7s",
  rival: "-4.1s",
  aide: "-0.9s",
  friend: "-3.4s",
  kid: "-2.2s",
  stranger: "-4.6s",
}

type CastFigureProps = {
  figure: FigureKey
  /** Their line is being heard: the figure bobs and its mouth moves. */
  speaking: boolean
  className?: string
}

/**
 * A character as the webtoon draws them beside their lines: one of the
 * cast's mascots, in the colours of the panel it sits in (the ink, the
 * accent and the panel's own ground, so a feeling panel's contrast floor
 * holds; MK5). While their line is heard it bobs, its mouth opens and shuts
 * and talk lines flicker beside it, which is all a reader needs to see who
 * is talking (`index.css`; under reduced motion the talk lines alone stay).
 * Decorative: the name beside it says who it is.
 */
export const CastFigure = ({
  figure,
  speaking,
  className,
}: CastFigureProps): JSX.Element => {
  const { body, details, eyes, mouth } = ART[figure]
  const [cx, cy, rx, ry] = mouth
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      data-slot="cast-figure"
      data-figure={figure}
      data-speaking={speaking ? "" : undefined}
      className={cn("cast-figure", className)}
    >
      <path
        className="cast-figure-talk-lines"
        d="M7 9.5 3.5 6M5 15.5H1.5M11 6 9.5 2M41 9.5 44.5 6M43 15.5h3.5M37 6l1.5-4"
      />
      <g className="cast-figure-body">
        {body}
        {details}
        <g
          className="cast-figure-eyes"
          style={{ animationDelay: BLINK_DELAY[figure] }}
        >
          {eyes}
        </g>
        <ellipse
          className="cast-figure-mouth"
          cx={cx}
          cy={cy}
          rx={rx}
          ry={ry}
        />
      </g>
    </svg>
  )
}
