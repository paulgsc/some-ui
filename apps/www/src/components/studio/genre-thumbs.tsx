/**
 * A stock thumbnail per genre (EPISODES2, #3067; the owner, #3030: "for now,
 * let's just have some stock svg in lieu of thumbail images for each
 * 'category' of video"), drawn in EPISODES1's prototype: one hue and one
 * shape per feed, so they stay apart at a row's size and for colour-blind
 * eyes. No genre takes sky or leaf, which a status dot means (`dotClass`,
 * C410). A drawing per episode, rendered by home, replaces these (EPISODES3).
 * Fixed art, the same in every theme, as a video's thumbnail is.
 */
import type { JSX } from "react"

import type { Feed } from "@/lib/feeds"
import { FEED_FACTS } from "@/lib/studio-index"

type Paint = { readonly hue: string; readonly ground: string }

/** Each genre's hue on its ground: honey, sand, lavender, lime and rose. */
const GENRE_PAINT = {
  call: { hue: "#e8a93c", ground: "#2e2416" },
  "cards-essay": { hue: "#e3d2ab", ground: "#29241a" },
  "interview-essay": { hue: "#b5a6ec", ground: "#201b33" },
  "playoff-delta": { hue: "#c9d46a", ground: "#252914" },
  "rust-essay": { hue: "#e58fb6", ground: "#2d1724" },
} as const satisfies Record<Feed, Paint>

const CALL_COLUMNS = [
  { items: 3, column: 0 },
  { items: 2, column: 1 },
  { items: 4, column: 2 },
] as const

/** The board, the call's first chapter, and a speech bubble. */
const Call = ({ hue, dim }: { hue: string; dim: string }): JSX.Element => (
  <>
    {CALL_COLUMNS.map(({ items, column }) => {
      const x = 62 + column * 70
      return (
        <g key={column}>
          <rect
            x={x}
            y={34}
            width={58}
            height={112}
            rx={8}
            fill="none"
            stroke={hue}
            strokeWidth={3}
            opacity={0.9}
          />
          <rect x={x + 8} y={42} width={30} height={5} rx={2.5} fill={hue} />
          {Array.from({ length: items }, (_, i) => (
            <rect
              key={i}
              x={x + 8}
              y={56 + i * 21}
              width={42}
              height={15}
              rx={4}
              fill={i === 0 && column === 1 ? hue : dim}
            />
          ))}
        </g>
      )
    })}
    <path
      d="M262 28h34a8 8 0 0 1 8 8v18a8 8 0 0 1-8 8h-20l-10 9v-9h-4a8 8 0 0 1-8-8V36a8 8 0 0 1 8-8z"
      fill={hue}
    />
  </>
)

/** A fan of cards, the top one checked: every claim checked. */
const Cards = ({
  hue,
  dim,
  ground,
}: {
  hue: string
  dim: string
  ground: string
}): JSX.Element => (
  <>
    {[
      { turn: -14, stroke: dim },
      { turn: 9, stroke: dim },
      { turn: 0, stroke: hue },
    ].map(({ turn, stroke }) => (
      <rect
        key={turn}
        x={122}
        y={40}
        width={76}
        height={104}
        rx={9}
        fill={ground}
        stroke={stroke}
        strokeWidth={3}
        transform={`rotate(${String(turn)} 160 96)`}
      />
    ))}
    <rect x={134} y={56} width={40} height={6} rx={3} fill={hue} />
    <rect x={134} y={70} width={52} height={5} rx={2.5} fill={dim} />
    <rect x={134} y={82} width={46} height={5} rx={2.5} fill={dim} />
    <circle cx={160} cy={118} r={13} fill={hue} />
    <path
      d="M153 118l5 5 9-10"
      fill="none"
      stroke={ground}
      strokeWidth={3.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </>
)

/** Paths to the playoff line, one reaching it, and a delta. */
const Delta = ({ hue, dim }: { hue: string; dim: string }): JSX.Element => (
  <>
    <line
      x1={250}
      y1={26}
      x2={250}
      y2={150}
      stroke={hue}
      strokeWidth={2.5}
      strokeDasharray="6 6"
    />
    <polyline
      points="40,128 90,116 140,120 190,86 236,60 262,48"
      fill="none"
      stroke={hue}
      strokeWidth={5}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <polyline
      points="40,104 90,108 140,96 190,112 236,128"
      fill="none"
      stroke={dim}
      strokeWidth={4}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx={262} cy={48} r={7} fill={hue} />
    <path
      d="M58 30 L84 72 H32 Z"
      fill="none"
      stroke={hue}
      strokeWidth={5}
      strokeLinejoin="round"
    />
  </>
)

/** The waveform's bars: each one's height, where it stands, whether it's lit. */
const INTERVIEW_BARS = [10, 22, 14, 28, 18, 24, 10].map((h, i) => ({
  h,
  x: 182 + i * 10,
}))

/** A question and an answer, the answer said aloud. */
const Interview = ({
  hue,
  ground,
}: {
  hue: string
  ground: string
}): JSX.Element => (
  <>
    <path
      d="M70 44h92a12 12 0 0 1 12 12v40a12 12 0 0 1-12 12h-56l-20 18v-18h-16a12 12 0 0 1-12-12V56a12 12 0 0 1 12-12z"
      fill={hue}
    />
    <text
      x={116}
      y={92}
      textAnchor="middle"
      fontFamily="Georgia, serif"
      fontWeight={700}
      fontSize={40}
      fill={ground}
    >
      ?
    </text>
    <path
      d="M162 76h88a12 12 0 0 1 12 12v36a12 12 0 0 1-12 12h-14v16l-18-16h-56a12 12 0 0 1-12-12V88a12 12 0 0 1 12-12z"
      fill={ground}
      stroke={hue}
      strokeWidth={3.5}
    />
    {INTERVIEW_BARS.map(({ h, x }) => (
      <rect
        key={x}
        x={x}
        y={106 - h / 2}
        width={5}
        height={h}
        rx={2.5}
        fill={hue}
      />
    ))}
  </>
)

const RUST_BARS = [14, 30, 22, 44, 34, 52, 28, 40, 18, 32, 12].map((h, i) => ({
  h,
  x: 194 + i * 9,
  lit: i % 3 === 1,
}))

/** A cog around braces, beside a waveform: every essay holds your voice. */
const Rust = ({
  hue,
  dim,
  ground,
}: {
  hue: string
  dim: string
  ground: string
}): JSX.Element => (
  <>
    {Array.from({ length: 10 }, (_, i) => (
      <rect
        key={i}
        x={113}
        y={40}
        width={14}
        height={18}
        rx={3}
        fill={hue}
        transform={`rotate(${String(i * 36)} 120 90)`}
      />
    ))}
    <circle cx={120} cy={90} r={40} fill={hue} />
    <circle cx={120} cy={90} r={27} fill={ground} />
    <text
      x={120}
      y={99}
      textAnchor="middle"
      fontFamily="ui-monospace, monospace"
      fontWeight={700}
      fontSize={26}
      fill={hue}
    >
      {"{ }"}
    </text>
    {RUST_BARS.map(({ h, x, lit }) => (
      <rect
        key={x}
        x={x}
        y={90 - h / 2}
        width={5}
        height={h}
        rx={2.5}
        fill={lit ? hue : dim}
      />
    ))}
  </>
)

/** `feed`'s stock thumbnail, 16:9, filling its box. */
export const GenreThumb = ({ feed }: { feed: Feed }): JSX.Element => {
  const { hue, ground } = GENRE_PAINT[feed]
  const dim = `${hue}55`
  return (
    <svg
      viewBox="0 0 320 180"
      role="img"
      aria-label={FEED_FACTS[feed].name}
      className="block h-full w-full"
    >
      <rect width={320} height={180} fill={ground} />
      {Array.from({ length: 9 }, (_, i) => (
        <circle key={i} cx={20 + i * 35} cy={164} r={1.6} fill={dim} />
      ))}
      {feed === "call" && <Call hue={hue} dim={dim} />}
      {feed === "cards-essay" && <Cards hue={hue} dim={dim} ground={ground} />}
      {feed === "interview-essay" && <Interview hue={hue} ground={ground} />}
      {feed === "playoff-delta" && <Delta hue={hue} dim={dim} />}
      {feed === "rust-essay" && <Rust hue={hue} dim={dim} ground={ground} />}
    </svg>
  )
}
