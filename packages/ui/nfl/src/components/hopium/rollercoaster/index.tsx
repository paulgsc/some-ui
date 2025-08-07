import { useEffect, useMemo, useRef, useState } from "react"
import { useElementSize } from "@nfl/hooks/use-element-size"
import type { MoodEvent } from "@nfl/types/hopium-tracker"
import { minMaxMood } from "@nfl/utils/mood"
import { smoothPath } from "@nfl/utils/path"
import { Card, CardContent } from "some-ui-shared"
import { cn } from "some-ui-utils"

type Props = {
  events: Array<MoodEvent>
  currentIndex: number
  animationDuration?: number // ms
  className?: string
}

// Simple formatter for x axis labels
function labelForIndex(events: Array<MoodEvent>, i: number) {
  const e = events[i]
  return e ? e.label : String(i)
}

export const RollercoasterChart = ({
  events,
  currentIndex,
  animationDuration = 600,
  className,
}: Props) => {
  const { ref, size } = useElementSize<HTMLDivElement>()
  const [dashLen, setDashLen] = useState(0)
  const pathRef = useRef<SVGPathElement | null>(null)

  const { min, max } = useMemo(() => minMaxMood(events), [events])

  const padding = { top: 16, right: 16, bottom: 44, left: 42 }
  const innerW = Math.max(0, size.width - padding.left - padding.right)
  const innerH = Math.max(0, size.height - padding.top - padding.bottom)

  const baseline = 100
  const progressed = events.slice(0, Math.min(currentIndex + 1, events.length))
  const last = progressed[progressed.length - 1]
  const above = (last.mood ?? baseline) >= baseline
  const lastUp = (last.delta ?? 0) >= 0

  // Scales
  const xFor = (i: number) => {
    if (events.length <= 1) return padding.left
    const step = innerW / (events.length - 1)
    return padding.left + i * step
  }
  const yFor = (v: number) => {
    if (max === min) return padding.top + innerH / 2
    const t = (v - min) / (max - min)
    // Flip for SVG y
    return padding.top + (1 - t) * innerH
  }

  const pointsAll = useMemo(
    () => events.map((e) => ({ x: xFor(e.index), y: yFor(e.mood) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, innerW, innerH, min, max] // xFor/yFor change when sizes or domain change
  )

  const pointsProg = useMemo(
    () => progressed.map((e) => ({ x: xFor(e.index), y: yFor(e.mood) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [progressed, innerW, innerH, min, max]
  )

  const dAll = useMemo(() => smoothPath(pointsAll, 0.6), [pointsAll])
  const dProg = useMemo(() => smoothPath(pointsProg, 0.6), [pointsProg])

  // Re-trigger dash animation on index change
  useEffect(() => {
    const path = pathRef.current
    if (!path) return
    const len = path.getTotalLength()
    setDashLen(len)
    // Set initial dash offset then animate to 0
    path.style.transition = "none"
    path.style.strokeDasharray = `${len} ${len}`
    path.style.strokeDashoffset = `${len}`
    // Allow style to apply
    const t = requestAnimationFrame(() => {
      path.style.transition = `stroke-dashoffset ${animationDuration}ms ease`
      path.style.strokeDashoffset = "0"
    })
    return () => cancelAnimationFrame(t)
  }, [currentIndex, dProg, animationDuration])

  // Last segment overlay (direction color)
  const lastSeg = useMemo(() => {
    if (pointsProg.length < 2) return null
    const a = pointsProg[pointsProg.length - 2]
    const b = pointsProg[pointsProg.length - 1]
    return `M ${a.x} ${a.y} L ${b.x} ${b.y}`
  }, [pointsProg])

  // Axis ticks (x uses event labels, y uses simple numeric)
  const xTicks = useMemo(
    () =>
      events.map((e) => ({
        x: xFor(e.index),
        label: labelForIndex(events, e.index),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, innerW]
  )
  const yTicks = useMemo(() => {
    const ticks = 5
    const arr: Array<number> = []
    for (let i = 0; i <= ticks; i++) {
      arr.push(Math.round(min + ((max - min) * i) / ticks))
    }
    return arr.map((v) => ({ y: yFor(v), label: v }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [min, max, innerH])

  return (
    <Card
      className={cn(
        "relative size-full border-white/10 bg-slate-900/60",
        className
      )}
    >
      {/* Dynamic background */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-0 transition-colors duration-500"
        style={{
          background: above
            ? "linear-gradient(180deg, rgba(16,185,129,0.15) 0%, rgba(59,130,246,0.08) 100%)"
            : "linear-gradient(180deg, rgba(244,63,94,0.15) 0%, rgba(234,179,8,0.08) 100%)",
        }}
      />
      <CardContent className="relative z-10 p-3 md:p-4">
        <div ref={ref} className="h-[320px] w-full">
          <svg
            width={size.width}
            height={size.height}
            role="img"
            aria-label="Mood rollercoaster chart"
          >
            {/* Grid */}
            <g>
              {/* Horizontal grid lines */}
              {yTicks.map((t, i) => (
                <line
                  key={`h-${i}`}
                  x1={padding.left}
                  y1={t.y}
                  x2={size.width - padding.right}
                  y2={t.y}
                  stroke="rgba(148,163,184,0.2)"
                  strokeDasharray="3 3"
                />
              ))}
              {/* Vertical grid lines */}
              {xTicks.map((t, i) => (
                <line
                  key={`v-${i}`}
                  x1={t.x}
                  y1={padding.top}
                  x2={t.x}
                  y2={size.height - padding.bottom}
                  stroke="rgba(148,163,184,0.08)"
                  strokeDasharray="3 3"
                />
              ))}
            </g>

            {/* Baseline */}
            <line
              x1={padding.left}
              y1={yFor(baseline)}
              x2={size.width - padding.right}
              y2={yFor(baseline)}
              stroke="rgba(148,163,184,0.45)"
              strokeDasharray="4 4"
            />

            {/* Full path (faint) */}
            {dAll && (
              <path
                d={dAll}
                fill="none"
                stroke="#a78bfa"
                strokeOpacity={0.25}
                strokeWidth={2}
              />
            )}

            {/* Progressed path (animated) */}
            {dProg && (
              <path
                ref={pathRef}
                d={dProg}
                fill="none"
                stroke="#38bdf8" /* sky-400 default */
                strokeWidth={3}
                strokeLinecap="round"
              />
            )}

            {/* Last segment overlay colored by direction */}
            {lastSeg && (
              <path
                d={lastSeg}
                fill="none"
                stroke={
                  lastUp ? "#22c55e" : "#fb7185"
                } /* emerald-500 or rose-400 */
                strokeWidth={4}
                strokeLinecap="round"
              />
            )}

            {/* Dots for progressed points */}
            {pointsProg.map((p, i) => (
              <circle
                key={`dot-${i}`}
                cx={p.x}
                cy={p.y}
                r={i === pointsProg.length - 1 ? 5 : 3.5}
                fill={i === pointsProg.length - 1 ? "#ffffff" : "#94a3b8"}
                stroke={
                  i === pointsProg.length - 1
                    ? lastUp
                      ? "#22c55e"
                      : "#fb7185"
                    : "transparent"
                }
                strokeWidth={i === pointsProg.length - 1 ? 2 : 0}
              />
            ))}

            {/* Axes */}
            {/* Y Axis */}
            <line
              x1={padding.left}
              y1={padding.top - 4}
              x2={padding.left}
              y2={size.height - padding.bottom}
              stroke="rgba(148,163,184,0.5)"
            />
            {yTicks.map((t, i) => (
              <text
                key={`ylabel-${i}`}
                x={padding.left - 8}
                y={t.y}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={11}
                fill="rgb(244 244 245)"
              >
                {t.label}
              </text>
            ))}

            {/* X Axis */}
            <line
              x1={padding.left - 4}
              y1={size.height - padding.bottom}
              x2={size.width - padding.right}
              y2={size.height - padding.bottom}
              stroke="rgba(148,163,184,0.5)"
            />
            {xTicks.map((t, i) => (
              <text
                key={`xlabel-${i}`}
                x={t.x}
                y={size.height - padding.bottom + 16}
                textAnchor="middle"
                dominantBaseline="hanging"
                fontSize={11}
                fill="rgb(244 244 245)"
              >
                {events[i]?.label ?? t.label}
              </text>
            ))}
          </svg>
        </div>
      </CardContent>
    </Card>
  )
}
