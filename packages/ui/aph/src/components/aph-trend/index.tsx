/**
 * The long view: each checkpoint's standing figure against its goal over
 * time, how the reconciliation stands overall as one bar, and what the
 * labels seem to change. Everything here is `stats` and `history` drawn;
 * nothing is computed in the component that a test cannot reach.
 */
import type { JSX } from "react"
import { useState } from "react"
import { CheckpointMark, checkpointTone, STATUS } from "@aph/components/status"
import type { AphSettings, Entry } from "@aph/lib/model"
import {
  formatDelta,
  formatValue,
  primary,
  reconcile,
  RECONCILE_ORDER,
  standing,
  stats,
} from "@aph/lib/model"
import type { AphStore } from "@aph/lib/store"
import { aphStore } from "@aph/lib/store"
import { useAph } from "@aph/lib/use-aph"
import { addDays, cn, dayOf, formatDay } from "@some-ui/core-utils"

type AphTrendProps = {
  /** The host's clock (`useMinuteClock` in www), which moves while the screen stays open. */
  now: Date
  store?: AphStore
}

const RANGES = [
  { id: "1w", label: "1W", days: 7 },
  { id: "3w", label: "3W", days: 21 },
  { id: "all", label: "All", days: null },
] as const

type RangeId = (typeof RANGES)[number]["id"]

/** Solid fills for the reconciliation bar, one per status. */
const BAR_FILL = {
  matched: "bg-success",
  agreed: "bg-success/60",
  awaiting: "bg-muted-foreground/25",
  review: "bg-warning",
  flagged: "bg-destructive",
} as const

export const AphTrend = ({
  now,
  store = aphStore,
}: AphTrendProps): JSX.Element => {
  const { settings, entries } = useAph(store)
  const [range, setRange] = useState<RangeId>("3w")
  const today = dayOf(now)
  const span = RANGES.find((r) => r.id === range)?.days ?? null
  const from =
    span === null || addDays(today, -(span - 1)) < settings.since
      ? settings.since
      : addDays(today, -(span - 1))
  const inRange = entries.filter((e) => e.day >= from && e.day <= today)
  const s = stats({ ...settings, since: from }, inRange, today)
  const total = RECONCILE_ORDER.reduce((n, k) => n + s.reconciliation[k], 0)

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-3">
      <section className="bg-card flex flex-col gap-2 rounded-xl border p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">
            {formatDay(from)} – {formatDay(today)}
          </span>
          <div role="radiogroup" aria-label="Range" className="flex gap-1">
            {RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                role="radio"
                aria-checked={range === r.id}
                onClick={() => setRange(r.id)}
                className={cn(
                  "h-8 rounded-full border px-3 text-xs",
                  range === r.id
                    ? "bg-foreground text-background border-foreground"
                    : "border-border"
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
        <Chart settings={settings} entries={inRange} from={from} to={today} />
        <div className="text-muted-foreground flex flex-wrap gap-3 text-xs">
          {settings.checkpoints.map((c) => (
            <span key={c.id} className="flex items-center gap-1.5">
              <CheckpointMark settings={settings} checkpoint={c.id} />
              {c.label}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span className="border-muted-foreground w-3.5 border-t-2 border-dashed" />
            goal
          </span>
          <span className="flex items-center gap-1.5">
            <span className="ring-destructive size-2.5 rounded-full ring-2" />
            flagged
          </span>
        </div>
      </section>

      <section
        aria-label="Reconciliation"
        className="bg-card flex flex-col gap-2 rounded-xl border p-3"
      >
        <span className="text-sm font-semibold">Reconciliation</span>
        <div className="flex h-3 overflow-hidden rounded-full">
          {RECONCILE_ORDER.filter((k) => s.reconciliation[k] > 0).map((k) => (
            <span
              key={k}
              className={BAR_FILL[k]}
              style={{ width: `${(s.reconciliation[k] / total) * 100}%` }}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {RECONCILE_ORDER.filter((k) => s.reconciliation[k] > 0).map((k) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className={cn("size-2 rounded-full", BAR_FILL[k])} />
              <span className="font-semibold tabular-nums">
                {s.reconciliation[k]}
              </span>
              <span className="text-muted-foreground">{STATUS[k].label}</span>
            </span>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-2">
        {s.checkpoints.map((c) => (
          <Tile
            key={c.checkpoint.id}
            label={
              <>
                <CheckpointMark
                  settings={settings}
                  checkpoint={c.checkpoint.id}
                />
                {c.checkpoint.label} average
              </>
            }
            value={c.average === null ? "—" : formatValue(c.average, true)}
            detail={
              c.averageDelta === null
                ? "no entries"
                : `${formatDelta(c.averageDelta)} vs goal · ${c.count} days`
            }
          />
        ))}
        <Tile
          label="Logged"
          value={`${s.loggedDays} / ${s.spanDays}`}
          detail={`days since ${formatDay(from)}`}
        />
        {s.firstToSecond !== null && (
          <Tile
            label={`${settings.checkpoints[0]?.label ?? ""} → ${settings.checkpoints[1]?.label ?? ""}`}
            value={
              s.firstToSecond.median === null
                ? "—"
                : formatDelta(s.firstToSecond.median)
            }
            detail={`median, ${s.firstToSecond.days} days with both`}
          />
        )}
      </div>

      {s.labels.some((l) => l.tagged > 0) && (
        <section
          aria-label="Labels"
          className="bg-card flex flex-col gap-2 rounded-xl border p-3"
        >
          <span className="text-sm font-semibold">Labels</span>
          {s.labels
            .filter((l) => l.tagged > 0)
            .map((l) => (
              <div key={l.label} className="flex items-center gap-2 text-sm">
                <span className="bg-muted rounded-full px-2.5 py-0.5 text-xs">
                  {l.label}
                </span>
                <span className="text-muted-foreground min-w-0 flex-1">
                  {l.difference === null
                    ? `on ${l.tagged}, nothing plain beside it yet`
                    : `mine reads ${formatDelta(l.difference)} with it`}
                </span>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {l.pairs > 0
                    ? `${l.pairs} pair${l.pairs === 1 ? "" : "s"}`
                    : l.tagged}
                </span>
              </div>
            ))}
        </section>
      )}
    </div>
  )
}

const Tile = ({
  label,
  value,
  detail,
}: {
  label: JSX.Element | string
  value: string
  detail: string
}): JSX.Element => (
  <div className="bg-card flex flex-col gap-0.5 rounded-xl border p-3">
    <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
      {label}
    </span>
    <span className="font-mono text-xl font-semibold tabular-nums">
      {value}
    </span>
    <span className="text-muted-foreground text-xs">{detail}</span>
  </div>
)

/**
 * The goal as it stood for each point: each entry keeps the goal it was made
 * under (`Entry.goal`), so the line steps where a goal changed rather than
 * redrawing the past at today's goal. Past the last entry it is today's.
 */
function goalSteps(
  points: ReadonlyArray<{ i: number; entry: Entry }>,
  current: number,
  x: (i: number) => number,
  y: (v: number) => number
): string {
  const goals = points.map((p) => ({
    at: x(p.i),
    goal: p.entry.goal ?? current,
  }))
  let goal = goals[0]?.goal ?? current
  let at: number = PAD.left
  const steps: Array<string> = [`${at},${y(goal)}`]
  for (const g of goals) {
    steps.push(`${g.at},${y(goal)}`, `${g.at},${y(g.goal)}`)
    goal = g.goal
    at = g.at
  }
  // After the last entry the goal is today's, from that point on.
  if (goal !== current) steps.push(`${at},${y(current)}`)
  steps.push(`${W - PAD.right},${y(current)}`)
  return steps.join(" ")
}

const W = 340
const H = 170
const PAD = { left: 36, right: 8, top: 8, bottom: 20 }

/**
 * One line per checkpoint through its standing figures, the goal as a
 * dashed line in the same colour, and a ring on anything flagged. Days
 * without an entry are simply not points: the line joins across them.
 */
const Chart = ({
  settings,
  entries,
  from,
  to,
}: {
  settings: AphSettings
  entries: ReadonlyArray<Entry>
  from: string
  to: string
}): JSX.Element => {
  const days: Array<string> = []
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d)
  const series = settings.checkpoints.map((c) => ({
    checkpoint: c,
    points: days.flatMap((day, i) => {
      const e = primary(entries, day, c.id)
      const v = e === undefined ? null : standing(e)
      return e === undefined || v === null ? [] : [{ i, v, entry: e }]
    }),
  }))
  const values = [
    ...series.flatMap((s) => s.points.map((p) => p.v)),
    ...series.flatMap((s) =>
      s.points.map((p) => p.entry.goal ?? s.checkpoint.goal)
    ),
    ...settings.checkpoints.map((c) => c.goal),
  ]
  const lo = Math.floor((Math.min(...values) - 200) / 500) * 500
  const hi = Math.ceil((Math.max(...values) + 200) / 500) * 500
  const x = (i: number): number =>
    PAD.left +
    (days.length === 1
      ? 0
      : (i / (days.length - 1)) * (W - PAD.left - PAD.right))
  const y = (v: number): number =>
    PAD.top + ((hi - v) / (hi - lo)) * (H - PAD.top - PAD.bottom)
  const ticks: Array<number> = []
  for (let v = lo; v <= hi; v += 500) ticks.push(v)

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label={`Standing figures from ${formatDay(from)} to ${formatDay(to)}, against each checkpoint's goal`}
    >
      {ticks.map((t) => (
        <g key={t}>
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y(t)}
            y2={y(t)}
            stroke="var(--border)"
          />
          <text
            x={PAD.left - 6}
            y={y(t) + 3}
            textAnchor="end"
            fontSize="10"
            fill="var(--muted-foreground)"
          >
            {(t / 1000).toFixed(1)}k
          </text>
        </g>
      ))}
      <text x={PAD.left} y={H - 4} fontSize="10" fill="var(--muted-foreground)">
        {formatDay(from)}
      </text>
      <text
        x={W - PAD.right}
        y={H - 4}
        fontSize="10"
        textAnchor="end"
        fill="var(--muted-foreground)"
      >
        {formatDay(to)}
      </text>
      {series.map(({ checkpoint, points }, k) => {
        const tone = checkpointTone(settings, checkpoint.id)
        return (
          <g key={checkpoint.id}>
            <polyline
              fill="none"
              stroke={tone}
              strokeDasharray="4 4"
              opacity="0.7"
              points={goalSteps(points, checkpoint.goal, x, y)}
            />
            <polyline
              fill="none"
              stroke={tone}
              strokeWidth="2"
              strokeLinejoin="round"
              points={points.map((p) => `${x(p.i)},${y(p.v)}`).join(" ")}
            />
            {points.map((p) => {
              const flagged = reconcile(settings, p.entry).status === "flagged"
              const cx = x(p.i)
              const cy = y(p.v)
              return (
                <g key={p.i}>
                  {flagged && (
                    <circle
                      cx={cx}
                      cy={cy}
                      r="6.5"
                      fill="none"
                      stroke="var(--destructive)"
                      strokeWidth="2"
                    />
                  )}
                  {k % 2 === 0 ? (
                    <circle cx={cx} cy={cy} r="3.5" fill={tone} />
                  ) : (
                    <rect
                      x={cx - 3.5}
                      y={cy - 3.5}
                      width="7"
                      height="7"
                      rx="1"
                      fill={tone}
                    />
                  )}
                </g>
              )
            })}
          </g>
        )
      })}
    </svg>
  )
}
