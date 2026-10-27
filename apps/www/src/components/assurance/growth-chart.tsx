import type { JSX } from "react"
import type { Comparison } from "@some-ui/assurance"

import { ASSURANCE_WORDS } from "@/lib/assurance/words"

/**
 * A before-and-after over workload size, both axes by powers of ten: a line
 * that climbs one decade per decade is work that grows with the history; a
 * flat one is work that does not. Each series is told apart by its line
 * style and its own label as well as its colour, and the table under it
 * holds every number.
 */
const W = 320
const H = 180
const PAD = { left: 52, right: 92, top: 12, bottom: 30 }
const STYLES = [
  { stroke: "var(--chart-1)", dash: undefined },
  { stroke: "var(--chart-2)", dash: "5 4" },
] as const

const compact = new Intl.NumberFormat("en", { notation: "compact" })
const full = new Intl.NumberFormat("en")

type Scale = { at: (v: number) => number; decades: Array<number> }

function scale(values: ReadonlyArray<number>, from: number, to: number): Scale {
  const logs = values.map((v) => Math.log10(Math.max(v, 1)))
  const lo = Math.floor(Math.min(...logs))
  const hi = Math.max(Math.ceil(Math.max(...logs)), lo + 1)
  return {
    at: (v: number): number =>
      from + ((Math.log10(Math.max(v, 1)) - lo) / (hi - lo)) * (to - from),
    decades: Array.from({ length: hi - lo + 1 }, (_, i) => 10 ** (lo + i)),
  }
}

export const GrowthChart = ({
  comparison,
}: {
  comparison: Comparison
}): JSX.Element => {
  const points = comparison.series.flatMap((s) => s.points)
  const xs = [...new Set(points.map(([x]) => x))].sort((a, b) => a - b)
  const x = scale(xs, PAD.left, W - PAD.right)
  const y = scale(
    points.map(([, v]) => v),
    H - PAD.bottom,
    PAD.top
  )
  return (
    <figure className="space-y-3">
      <figcaption className="text-muted-foreground text-xs leading-relaxed">
        {comparison.what}
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full max-w-xl"
        role="img"
        aria-label={`${comparison.y} by ${comparison.x}`}
      >
        {y.decades.map((d) => (
          <g key={d}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y.at(d)}
              y2={y.at(d)}
              className="stroke-border"
              strokeWidth={1}
            />
            <text
              x={PAD.left - 6}
              y={y.at(d)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-muted-foreground text-[9px]"
            >
              {compact.format(d)}
            </text>
          </g>
        ))}
        {xs.map((v) => (
          <text
            key={v}
            x={x.at(v)}
            y={H - PAD.bottom + 14}
            textAnchor="middle"
            className="fill-muted-foreground text-[9px]"
          >
            {compact.format(v)}
          </text>
        ))}
        <text
          x={(PAD.left + W - PAD.right) / 2}
          y={H - 2}
          textAnchor="middle"
          className="fill-muted-foreground text-[9px]"
        >
          {comparison.x}
        </text>
        {comparison.series.map((series, i) => {
          const style = STYLES[i % STYLES.length] ?? STYLES[0]
          const path = series.points
            .map(
              ([px, py], n) => `${n === 0 ? "M" : "L"}${x.at(px)},${y.at(py)}`
            )
            .join(" ")
          const last = series.points.at(-1)
          return (
            <g key={series.label}>
              <path
                d={path}
                fill="none"
                stroke={style.stroke}
                strokeWidth={2}
                strokeDasharray={style.dash}
              />
              {series.points.map(([px, py]) => (
                <circle
                  key={px}
                  cx={x.at(px)}
                  cy={y.at(py)}
                  r={4}
                  fill={style.stroke}
                  className="stroke-background"
                  strokeWidth={2}
                >
                  <title>{`${series.label}: ${full.format(py)} ${comparison.y} at ${full.format(px)} ${comparison.x}`}</title>
                </circle>
              ))}
              {last && (
                <text
                  x={x.at(last[0]) + 8}
                  y={y.at(last[1])}
                  dominantBaseline="middle"
                  className="fill-foreground text-[10px]"
                >
                  {series.label}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      <table className="text-muted-foreground w-full max-w-xl text-xs tabular-nums">
        <thead>
          <tr className="text-left">
            <th className="py-1 pr-4 font-medium">{comparison.x}</th>
            {comparison.series.map((s) => (
              <th key={s.label} className="py-1 pr-4 text-right font-medium">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {xs.map((v) => (
            <tr key={v} className="border-border/60 border-t">
              <td className="py-1 pr-4">{full.format(v)}</td>
              {comparison.series.map((s) => {
                const point = s.points.find(([px]) => px === v)
                return (
                  <td key={s.label} className="py-1 pr-4 text-right">
                    {point ? full.format(point[1]) : "–"}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-muted-foreground text-xs">
        <span className="font-medium">{ASSURANCE_WORDS.limits}:</span>{" "}
        {comparison.limits}
      </p>
    </figure>
  )
}
