/**
 * My data's three charts (MY-DATA MD2, #2476), drawn to the dataviz method:
 *
 * - **Space by kind:** ranked horizontal bars, one hue, the most room first,
 *   each bar's value at its tip, 4px rounded at the data end and square at
 *   the baseline.
 * - **How it grows on home:** one 2px line with a 10% wash, an end dot with
 *   a surface ring and its value beside it; hairline grid. One series, so
 *   no legend: the title names it. Each week's number is in the table.
 * - **Where your recordings are:** a thin segmented bar (8px, 2px surface
 *   gaps, no text) over the list that gives each part's name and count.
 *   The parts read as steps along the way home, so they are one hue's ramp,
 *   light (only on this phone) to dark (set aside, on home), with their own
 *   steps in dark mode. Both ramps pass the dataviz validator (`--ordinal`):
 *   blue-400, 600, 800 and 950 on the light surface, blue-700, 500, 300 and
 *   100 on the dark one.
 *
 * Every number is also in the tables under them (`MyDataTables`). Text wears
 * text tokens, never a series colour. Phone build only (`device-*`).
 */
import type { JSX } from "react"

import type { Overview, Where } from "@/lib/my-data"
import { WHERE_ORDER } from "@/lib/my-data"
import {
  KIND_NAMES,
  MB,
  MY_DATA,
  recordingsCount,
  weekOf,
  WHERE_WORDS,
} from "@/lib/my-data/words"

/** The one hue the bars and the line wear. */
const MARK = {
  bg: "bg-blue-600 dark:bg-blue-400",
  stroke: "stroke-blue-600 dark:stroke-blue-400",
  fill: "fill-blue-600 dark:fill-blue-400",
} as const

/** Each part of "where", a step of the ramp: see the module's note. */
export const WHERE_FILL: Readonly<Record<Where, string>> = {
  phone: "bg-blue-400 dark:bg-blue-700",
  going: "bg-blue-600 dark:bg-blue-500",
  home: "bg-blue-800 dark:bg-blue-300",
  aside: "bg-blue-950 dark:bg-blue-100",
}

const mb = (bytes: number): string => (bytes / MB).toFixed(1)

const Card = ({
  title,
  sub,
  children,
}: {
  title: string
  sub?: string
  children: JSX.Element | ReadonlyArray<JSX.Element>
}): JSX.Element => (
  <figure className="bg-card min-w-0 space-y-3 rounded-xl border p-4">
    <figcaption className="flex flex-wrap items-baseline gap-x-2">
      <span className="text-sm font-semibold">{title}</span>
      {sub === undefined ? null : (
        <span className="text-muted-foreground text-xs">{sub}</span>
      )}
    </figcaption>
    {children}
  </figure>
)

export const SpaceBars = ({
  kinds,
}: {
  kinds: Overview["kinds"]
}): JSX.Element => {
  const most = Math.max(...kinds.map((k) => k.bytes), 1)
  return (
    <Card title={MY_DATA.space.title} sub={MY_DATA.space.sub}>
      <ul className="space-y-2.5">
        {kinds.map((kind) => {
          const name = KIND_NAMES[kind.of]
          return (
            <li
              key={kind.of}
              className="space-y-1"
              title={`${name} · ${kind.notes} · ${mb(kind.bytes)} MB`}
            >
              <span className="text-muted-foreground block text-xs break-words">
                {name}
              </span>
              <span className="flex items-center gap-2">
                <span
                  className={`${MARK.bg} block h-3 min-w-0.5 rounded-r-[4px]`}
                  style={{ width: `${(kind.bytes / most) * 80}%` }}
                  aria-hidden
                />
                <span className="text-xs tabular-nums">{mb(kind.bytes)}</span>
              </span>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

const W = 320
const H = 160
const PAD = { left: 30, right: 56, top: 10, bottom: 22 }

/** A clean top for the axis: 1, 2 or 5 times a power of ten. */
function niceTop(value: number): number {
  if (value <= 0) return 1
  const power = 10 ** Math.floor(Math.log10(value))
  const step = [1, 2, 5, 10].find((n) => n * power >= value) ?? 10
  return step * power
}

export const GrowthLine = ({
  growth,
}: {
  growth: Overview["growth"]
}): JSX.Element => {
  const last = growth.at(-1)
  if (last === undefined)
    return (
      <Card title={MY_DATA.growth.title} sub={MY_DATA.growth.sub}>
        <p className="text-muted-foreground text-sm">{MY_DATA.growth.empty}</p>
      </Card>
    )
  const values = growth.map((week) => week.bytes / MB)
  const top = niceTop(Math.max(...values))
  const span = Math.max(growth.length - 1, 1)
  const x = (i: number): number =>
    PAD.left + (i / span) * (W - PAD.left - PAD.right)
  const y = (v: number): number =>
    PAD.top + (1 - v / top) * (H - PAD.top - PAD.bottom)
  const line = values
    .map(
      (v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`
    )
    .join("")
  const area = `${line}L${x(values.length - 1)},${y(0)}L${x(0)},${y(0)}Z`
  const ticks = [0, top / 2, top]
  const labelled = [0, Math.floor((growth.length - 1) / 2), growth.length - 1]
  const lastValue = values.at(-1) ?? 0
  return (
    <Card title={MY_DATA.growth.title} sub={MY_DATA.growth.sub}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`${MY_DATA.growth.title}: ${mb(last.bytes)} MB by the week of ${weekOf(last.week)}`}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(t)}
              y2={y(t)}
              className="stroke-border"
              strokeWidth={1}
            />
            <text
              x={PAD.left - 6}
              y={y(t)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-muted-foreground text-[10px] tabular-nums"
            >
              {Number.isInteger(t) ? t : t.toFixed(1)}
            </text>
          </g>
        ))}
        {[...new Set(labelled)].map((i) => (
          <text
            key={i}
            x={x(i)}
            y={H - 6}
            textAnchor="middle"
            className="fill-muted-foreground text-[10px]"
          >
            {weekOf(growth[i]?.week ?? last.week)}
          </text>
        ))}
        <path d={area} className={MARK.fill} fillOpacity={0.1} />
        <path
          d={line}
          fill="none"
          className={MARK.stroke}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle
          cx={x(values.length - 1)}
          cy={y(lastValue)}
          r={4.5}
          className={`${MARK.fill} stroke-card`}
          strokeWidth={2}
        />
        <text
          x={x(values.length - 1) + 9}
          y={y(lastValue)}
          dominantBaseline="middle"
          className="fill-foreground text-[11px] tabular-nums"
        >
          {mb(last.bytes)}
        </text>
      </svg>
      <p className="text-muted-foreground text-xs">{MY_DATA.growth.phone}</p>
    </Card>
  )
}

export const WhereBar = ({
  where,
}: {
  where: Overview["where"]
}): JSX.Element => {
  const total = WHERE_ORDER.reduce((n, part) => n + where[part], 0)
  const parts = WHERE_ORDER.filter((part) => where[part] > 0)
  return (
    <Card title={MY_DATA.where.title} sub={recordingsCount(total)}>
      <div
        className="flex h-2 gap-0.5"
        role="img"
        aria-label={WHERE_ORDER.map(
          (part) => `${WHERE_WORDS[part]} ${where[part]}`
        ).join(", ")}
      >
        {parts.map((part) => (
          <span
            key={part}
            className={`${WHERE_FILL[part]} block h-full min-w-1 rounded-full`}
            style={{ flexGrow: where[part] }}
            title={`${WHERE_WORDS[part]} · ${where[part]}`}
          />
        ))}
      </div>
      <ul className="space-y-1">
        {WHERE_ORDER.map((part) => (
          <li key={part} className="flex items-center gap-2 text-xs">
            <span
              className={`${WHERE_FILL[part]} size-2.5 shrink-0 rounded-sm`}
              aria-hidden
            />
            <span className="text-muted-foreground min-w-0 flex-1">
              {WHERE_WORDS[part]}
            </span>
            <span className="tabular-nums">{where[part]}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

/** Every number the charts draw. */
export const MyDataTables = ({
  overview,
}: {
  overview: Overview
}): JSX.Element => (
  <div className="bg-card min-w-0 space-y-4 overflow-x-auto rounded-xl border p-4 text-xs">
    <table className="w-full tabular-nums">
      <caption className="text-muted-foreground pb-1 text-left font-medium">
        {MY_DATA.tableCaptions.kinds}
      </caption>
      <thead>
        <tr className="text-left">
          <th className="py-1 pr-2 font-medium">{MY_DATA.tableHeads.kind}</th>
          <th className="py-1 pr-2 text-right font-medium">
            {MY_DATA.tableHeads.count}
          </th>
          <th className="py-1 text-right font-medium">
            {MY_DATA.tableHeads.mb}
          </th>
        </tr>
      </thead>
      <tbody>
        {overview.kinds.map((kind) => (
          <tr key={kind.of} className="border-border/60 border-t">
            <td className="py-1 pr-2">{KIND_NAMES[kind.of]}</td>
            <td className="py-1 pr-2 text-right">{kind.notes}</td>
            <td className="py-1 text-right">{mb(kind.bytes)}</td>
          </tr>
        ))}
      </tbody>
    </table>
    {overview.growth.length === 0 ? null : (
      <table className="w-full tabular-nums">
        <caption className="text-muted-foreground pb-1 text-left font-medium">
          {MY_DATA.tableCaptions.growth}
        </caption>
        <thead>
          <tr className="text-left">
            <th className="py-1 pr-2 font-medium">{MY_DATA.tableHeads.week}</th>
            <th className="py-1 text-right font-medium">
              {MY_DATA.tableHeads.home}
            </th>
          </tr>
        </thead>
        <tbody>
          {overview.growth.map((week) => (
            <tr key={week.week} className="border-border/60 border-t">
              <td className="py-1 pr-2">{weekOf(week.week)}</td>
              <td className="py-1 text-right">{mb(week.bytes)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
    <table className="w-full tabular-nums">
      <caption className="text-muted-foreground pb-1 text-left font-medium">
        {MY_DATA.tableCaptions.where}
      </caption>
      <thead>
        <tr className="text-left">
          <th className="py-1 pr-2 font-medium">{MY_DATA.tableHeads.where}</th>
          <th className="py-1 text-right font-medium">
            {MY_DATA.tableHeads.count}
          </th>
        </tr>
      </thead>
      <tbody>
        {WHERE_ORDER.map((part) => (
          <tr key={part} className="border-border/60 border-t">
            <td className="py-1 pr-2">{WHERE_WORDS[part]}</td>
            <td className="py-1 text-right">{overview.where[part]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)
