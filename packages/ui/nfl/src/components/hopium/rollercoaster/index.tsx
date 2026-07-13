import type { JSX } from "react"
import { useLayoutEffect, useMemo, useRef, useState } from "react"
import { useElementSize } from "@nfl/hooks/hopium/use-element-size"
import type { MoodEvent } from "@nfl/types/hopium/hopium-tracker"
import { minMaxMood } from "@nfl/utils/hopium/mood"
import { smoothPath } from "@nfl/utils/path"
import { Card, CardContent } from "some-ui-shared"
import { cn } from "some-ui-utils"

type Props = {
  events: Array<MoodEvent>
  currentIndex: number
  animationDuration?: number
  className?: string
}

const PADDING = { top: 16, right: 16, bottom: 44, left: 42 }
const BASELINE = 100

export const RollercoasterChart = ({
  events,
  currentIndex,
  animationDuration = 600,
  className,
}: Props): JSX.Element => {
  const { ref, size } = useElementSize<HTMLDivElement>()
  const pathRef = useRef<SVGPathElement | null>(null)
  const [dashOffset, setDashOffset] = useState(0)
  const [totalLength, setTotalLength] = useState(0)

  const { min, max } = useMemo(() => minMaxMood(events), [events])

  const innerW = Math.max(0, size.width - PADDING.left - PADDING.right)
  const innerH = Math.max(0, size.height - PADDING.top - PADDING.bottom)

  const scales = useMemo(() => {
    const xFor = (i: number): number => {
      if (events.length <= 1) return PADDING.left
      return PADDING.left + i * (innerW / (events.length - 1))
    }
    const yFor = (v: number): number => {
      if (max === min) return PADDING.top + innerH / 2
      const t = (v - min) / (max - min)
      return PADDING.top + (1 - t) * innerH
    }
    return { xFor, yFor }
  }, [events.length, innerW, innerH, min, max])

  const progressed = useMemo(
    () => events.slice(0, Math.min(currentIndex + 1, events.length)),
    [events, currentIndex]
  )

  const lastEvent = progressed[progressed.length - 1]
  const aboveBaseline = (lastEvent?.mood ?? 0) >= BASELINE
  const isLastUp = (lastEvent?.delta ?? 0) >= 0

  const pointsAll = useMemo(
    () =>
      events.map((e) => ({ x: scales.xFor(e.index), y: scales.yFor(e.mood) })),
    [events, scales]
  )

  const pointsProg = useMemo(
    () =>
      progressed.map((e) => ({
        x: scales.xFor(e.index),
        y: scales.yFor(e.mood),
        id: e.id,
      })),
    [progressed, scales]
  )

  const dAll = useMemo(() => smoothPath(pointsAll, 0.6), [pointsAll])
  const dProg = useMemo(() => smoothPath(pointsProg, 0.6), [pointsProg])

  useLayoutEffect(() => {
    if (!pathRef.current) return
    const length = pathRef.current.getTotalLength()
    setTotalLength(length)
    setDashOffset(length)

    const raf = requestAnimationFrame(() => {
      setDashOffset(0)
    })
    return (): void => cancelAnimationFrame(raf)
  }, [dProg])

  const lastSegmentPath = useMemo(() => {
    const b = pointsProg[pointsProg.length - 1]
    const a = pointsProg[pointsProg.length - 2]
    if (!a || !b) return null
    return `M ${a.x} ${a.y} L ${b.x} ${b.y}`
  }, [pointsProg])

  const yTicks = useMemo(() => {
    const count = 5
    return Array.from({ length: count + 1 }, (_, i) => {
      const val = Math.round(min + ((max - min) * i) / count)
      return { y: scales.yFor(val), label: val }
    })
  }, [min, max, scales])

  return (
    <Card
      className={cn(
        "relative size-full overflow-hidden border-white/10 bg-slate-900/60",
        className
      )}
    >
      <div
        className="absolute inset-0 -z-0 transition-colors duration-1000"
        style={{
          background: aboveBaseline
            ? "linear-gradient(180deg, rgba(16,185,129,0.12) 0%, rgba(59,130,246,0.05) 100%)"
            : "linear-gradient(180deg, rgba(244,63,94,0.12) 0%, rgba(234,179,8,0.05) 100%)",
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
            {/* Grid Lines */}
            <g stroke="currentColor" strokeDasharray="3 3">
              {yTicks.map((t) => (
                <line
                  key={`grid-line-${t.label}`}
                  x1={PADDING.left}
                  y1={t.y}
                  x2={size.width - PADDING.right}
                  y2={t.y}
                  className="text-slate-400/20"
                />
              ))}
            </g>

            {/* Baseline */}
            <line
              x1={PADDING.left}
              y1={scales.yFor(BASELINE)}
              x2={size.width - PADDING.right}
              y2={scales.yFor(BASELINE)}
              stroke="rgba(148,163,184,0.4)"
              strokeDasharray="4 4"
            />

            {/* Background Path (Shadow) */}
            <path
              d={dAll}
              fill="none"
              stroke="#a78bfa"
              strokeOpacity={0.15}
              strokeWidth={2}
            />

            {/* Progress Path (Animated) */}
            <path
              ref={pathRef}
              d={dProg}
              fill="none"
              stroke="#38bdf8"
              strokeWidth={3}
              strokeLinecap="round"
              style={{
                strokeDasharray: totalLength,
                strokeDashoffset: dashOffset,
                transition: `stroke-dashoffset ${animationDuration}ms ease-out`,
              }}
            />

            {/* Current Delta Segment */}
            {lastSegmentPath && (
              <path
                d={lastSegmentPath}
                fill="none"
                stroke={isLastUp ? "#22c55e" : "#fb7185"}
                strokeWidth={4}
                strokeLinecap="round"
              />
            )}

            {/* Dots */}
            {pointsProg.map((p, i) => {
              const isLast = i === pointsProg.length - 1
              return (
                <circle
                  key={`dot-${p.id}`}
                  cx={p.x}
                  cy={p.y}
                  r={isLast ? 5 : 3}
                  fill={isLast ? "#fff" : "#64748b"}
                  stroke={isLast ? (isLastUp ? "#22c55e" : "#fb7185") : "none"}
                  strokeWidth={isLast ? 3 : 0}
                />
              )
            })}

            {/* Axes Labels */}
            <g fontSize={11} fill="currentColor" className="text-zinc-100">
              {yTicks.map((t) => (
                <text
                  key={`y-label-${t.label}`}
                  x={PADDING.left - 8}
                  y={t.y}
                  textAnchor="end"
                  dominantBaseline="middle"
                >
                  {t.label}
                </text>
              ))}
              {events.map((e) => (
                <text
                  key={`x-label-${e.id}`}
                  x={scales.xFor(e.index)}
                  y={size.height - PADDING.bottom + 16}
                  textAnchor="middle"
                >
                  {e.label}
                </text>
              ))}
            </g>
          </svg>
        </div>
      </CardContent>
    </Card>
  )
}
