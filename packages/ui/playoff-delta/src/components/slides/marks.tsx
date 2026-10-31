/**
 * The marks every slide shares: a piece's light, the strip of the week's
 * ways, and the week's five bands. Each looks the same every week and in
 * the legend, so a viewer reads them without being taught again.
 */
import type { CSSProperties, JSX } from "react"
import { SymbolGlyph } from "@playoff-delta/components/symbol"
import { size } from "@playoff-delta/lib/story"
import { symbolFor } from "@playoff-delta/lib/symbols"
import {
  BANDS,
  MATERIAL,
  PIECES,
  widthOf,
  type Band,
  type Material,
  type PieceNoun,
} from "@playoff-delta/lib/words"

import { delay } from "./shared"

/**
 * A light's size is its price on one scale for every week: no bigger past
 * `LIGHT_FULL` (20 points), so the same size means the same worth in any
 * episode. Its area grows with the price.
 */
const LIGHT_FULL = 0.2
const lightSize = (price: number): string =>
  `${4 + 9 * Math.sqrt(Math.min(price, LIGHT_FULL) / LIGHT_FULL)}cqw`

export type LightState = "made" | "missed" | "waiting"

const LIGHT_CLASS: Readonly<Record<LightState, string>> = {
  made: "pd-light--made",
  missed: "pd-light--missed",
  waiting: "pd-light--waiting",
}

/** One piece: its glyph and noun, and its light, sized by its price. */
export const PieceLight = ({
  noun,
  material,
  price,
  state,
  label,
  note,
  at,
  compact = false,
}: {
  noun: PieceNoun
  material: Material
  price: number
  state: LightState
  /** "SF over ATL", or a team code. */
  label: string
  /** Under the label: the price, or "woke". */
  note?: string
  at: number
  /** Without its noun and material written out: the glyph and size say them. */
  compact?: boolean
}): JSX.Element => {
  const s = symbolFor(noun)
  const style: CSSProperties & Record<"--s", string> = {
    ...delay(at),
    "--s": lightSize(price),
  }
  return (
    <div className="pd-light-cell">
      <div className="flex items-end gap-[1cqw]">
        <SymbolGlyph
          parts={s.parts}
          hue={s.hue}
          delay={at}
          className="size-[6cqw]"
        />
        <i
          role="img"
          aria-label={`${PIECES[noun].noun}, ${MATERIAL[material].word}: ${label}, ${state}`}
          className={`pd-light ${LIGHT_CLASS[state]} ${material === "idle" ? "pd-light--idle" : ""}`}
          style={style}
        />
      </div>
      <span className="pd-mono pd-small font-semibold">{label}</span>
      {compact ? null : (
        <span className="pd-mono text-muted-foreground text-[2.5cqw]">
          {PIECES[noun].noun} · {MATERIAL[material].word}
        </span>
      )}
      {note ? <span className="pd-mono text-[2.5cqw]">{note}</span> : null}
    </div>
  )
}

/** A price as the note under a light: "2.5 pts". */
export const priceNote = (price: number): string => `${size(price)} pts`

/** Grid lines, one per point of share, or per five when the strip is wide. */
function gridOf(low: number, high: number): ReadonlyArray<number> {
  const from = Math.ceil(low * 100)
  const to = Math.floor(high * 100)
  const step = to - from > 40 ? 5 : 1
  const lines: Array<number> = []
  for (let p = Math.ceil(from / step) * step; p <= to; p += step)
    lines.push(p / 100)
  return lines
}

type MarkTone = "best" | "mean" | "actual"

/** Complete class strings, so a content scan sees every one. */
const MARK_CLASS: Readonly<Record<MarkTone, string>> = {
  best: "pd-ways__mark--best",
  mean: "pd-ways__mark--mean",
  actual: "pd-ways__mark--actual",
}

const KEY_CLASS: Readonly<Record<MarkTone, string>> = {
  best: "pd-ways__key--best",
  mean: "pd-ways__key--mean",
  actual: "pd-ways__key--actual",
}

/**
 * The week's ways as a histogram on a share axis: every way the week could
 * have gone, and then, row by row, the ways still possible after each result
 * in kickoff order, each drawn over the last (they nest, so the strip
 * narrows to the one way that happened). Heights grow with the log of a
 * bin's count, so one way still shows beside thousands.
 */
export const Strip = ({
  low,
  high,
  rows,
  marks,
  start = 0.4,
  step = 0,
}: {
  low: number
  high: number
  /** Bin counts, from all the week's ways to the ways left. */
  rows: ReadonlyArray<ReadonlyArray<number>>
  /** Lines on the share axis: the best week, the mean, what happened. */
  marks: ReadonlyArray<{
    readonly at: number
    readonly label: string
    readonly tone: MarkTone
    readonly reveal: number
  }>
  start?: number
  /** Seconds between rows; 0 draws them together. */
  step?: number
}): JSX.Element => {
  const span = high - low || 1
  const x = (share: number): number => ((share - low) / span) * 100
  const top = Math.log2(1 + Math.max(1, ...(rows[0] ?? [])))
  const bins = rows[0]?.length ?? 20
  const w = 100 / bins
  return (
    <div className="flex flex-col gap-[1cqw]">
      <svg
        viewBox="0 0 100 40"
        preserveAspectRatio="none"
        className="pd-ways h-[30cqw] w-full"
        aria-hidden="true"
      >
        {gridOf(low, high).map((g) => (
          <line
            key={g}
            className="pd-ways__grid"
            x1={x(g)}
            x2={x(g)}
            y1={0}
            y2={40}
          />
        ))}
        {rows.map((row, r) => (
          <g
            // eslint-disable-next-line react/no-array-index-key -- a row is its place on the road
            key={r}
            className="pd-in pd-ways__row"
            style={{
              ...delay(start + r * step),
              opacity: 0.25 + (0.75 * (r + 1)) / rows.length,
            }}
          >
            {row.map((count, b) =>
              count > 0 ? (
                <rect
                  // eslint-disable-next-line react/no-array-index-key -- a bin is its place on the axis
                  key={b}
                  x={b * w + 0.3}
                  width={w - 0.6}
                  y={40 - (Math.log2(1 + count) / top) * 38}
                  height={(Math.log2(1 + count) / top) * 38}
                />
              ) : null
            )}
          </g>
        ))}
        {marks.map((m) => (
          <line
            key={m.tone}
            className={`pd-in pd-ways__mark ${MARK_CLASS[m.tone]}`}
            style={delay(m.reveal)}
            x1={x(m.at)}
            x2={x(m.at)}
            y1={0}
            y2={40}
          />
        ))}
      </svg>
      <div className="pd-mono text-muted-foreground flex justify-between text-[2.4cqw]">
        <span>{(low * 100).toFixed(1)}%</span>
        <span className="flex gap-[2.5cqw]">
          {marks.map((m) => (
            <span
              key={m.tone}
              className={`pd-in ${KEY_CLASS[m.tone]}`}
              style={delay(m.reveal)}
            >
              {m.label}
            </span>
          ))}
        </span>
        <span>{(high * 100).toFixed(1)}%</span>
      </div>
    </div>
  )
}

/** The class a band's colour comes from. */
export const BAND_CLASS: Readonly<Record<Band, string>> = {
  "all-greens": "pd-band--all-greens",
  "mostly-green": "pd-band--mostly-green",
  "stop-and-go": "pd-band--stop-and-go",
  "mostly-red": "pd-band--mostly-red",
  "all-reds": "pd-band--all-reds",
}

/**
 * The five bands at their fixed widths, worst on the left, with a rank
 * marked on it when given: the same bar every week.
 */
export const Bands = ({
  rank,
  at = 0.4,
}: {
  rank?: number
  at?: number
}): JSX.Element => {
  const worstFirst = [...BANDS].reverse()
  return (
    <div className="flex flex-col gap-[1cqw]">
      <div className="pd-bands">
        {worstFirst.map((b, i) => (
          <div
            key={b.band}
            className={`pd-in pd-bands__band ${BAND_CLASS[b.band]}`}
            // A zero basis, so a label's width never moves a boundary off
            // the scale the rank's mark is placed on.
            style={{
              ...delay(at + i * 0.15),
              flexGrow: widthOf(b.band),
              flexBasis: 0,
            }}
          >
            <span className="pd-mono">{b.phrase}</span>
          </div>
        ))}
        {rank === undefined ? null : (
          <i
            className="pd-bands__mark"
            style={{ ...delay(at + 1), left: `${rank * 100}%` }}
          />
        )}
      </div>
      <div className="pd-mono text-muted-foreground flex justify-between text-[2.4cqw]">
        <span>0 of 100 ways worse</span>
        <span>100 of 100 ways worse</span>
      </div>
    </div>
  )
}
