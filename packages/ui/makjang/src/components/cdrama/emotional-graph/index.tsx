import { useEffect, useMemo, useState } from "react"
import { TrendingUp } from "lucide-react"
import { cn } from "some-ui-utils"

type EmotionalDataPoint = {
  minute: number
  emotion: string
  intensity: number
  notes: string
}

type EmotionalGraphProps = {
  data: Array<EmotionalDataPoint>
  currentMinute: number
}

type Emotions =
  | "joy"
  | "sadness"
  | "fear"
  | "anger"
  | "surprise"
  | "disgust"
  | "neutral"

const emotionConfig: Record<
  Emotions,
  { color: string; emoji: string; label: string }
> = {
  joy: { color: "#fbbf24", emoji: "😊", label: "Joy" },
  sadness: { color: "#818cf8", emoji: "😢", label: "Sadness" },
  fear: { color: "#f472b6", emoji: "😰", label: "Fear" },
  anger: { color: "#fb923c", emoji: "😠", label: "Anger" },
  surprise: { color: "#a78bfa", emoji: "😲", label: "Surprise" },
  disgust: { color: "#4ade80", emoji: "🤢", label: "Disgust" },
  neutral: { color: "#94a3b8", emoji: "😐", label: "Neutral" },
}

export const EmotionalGraph = ({
  data,
  currentMinute,
}: EmotionalGraphProps) => {
  const [mounted, setMounted] = useState(false)
  const maxIntensity = 1
  const graphHeight = 300
  const graphWidth = 800

  useEffect(() => {
    setMounted(true)
  }, [])

  const points = useMemo(() => {
    return data.map((point) => {
      const x = (point.minute / 45) * graphWidth
      const y = graphHeight - (point.intensity / maxIntensity) * graphHeight
      return { x, y, ...point }
    })
  }, [data])

  const pathD = useMemo(() => {
    // 1. Guard against empty arrays explicitly
    const firstPoint = points[0]
    if (!firstPoint) return ""

    let path = `M ${firstPoint.x} ${firstPoint.y}`

    for (let i = 1; i < points.length; i++) {
      // 2. Use explicit variable assignment to prove existence to the linter
      const prev = points[i - 1]
      const curr = points[i]

      // 3. Add a secondary check if your lint is extremely strict
      if (prev && curr) {
        const cpX = (prev.x + curr.x) / 2
        path += ` Q ${cpX} ${prev.y}, ${curr.x} ${curr.y}`
      }
    }
    return path
  }, [points])
  const currentX = (currentMinute / 45) * graphWidth

  return (
    <div
      className={cn(
        "cdrama relative overflow-hidden rounded-3xl border-2 p-6 shadow-xl transition-all duration-700",
        "border-[color:var(--cdrama-accent)]",
        "bg-gradient-to-br from-[color:var(--card)] to-[color:var(--cdrama-surface)]",
        "max-w-full max-h-full box-border"
      )}
    >
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[color:var(--cdrama-accent)] to-[color:var(--cdrama-blossom)] shadow-lg">
            <TrendingUp className="h-5 w-5 text-white" />
          </div>
          <h2 className="font-serif text-xl font-bold text-[color:var(--foreground)]">
            Emotional Roller Coaster
          </h2>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3">
          {Object.entries(emotionConfig).map(([key, config]) => (
            <div key={key} className="flex items-center gap-2">
              <span className="text-lg">{config.emoji}</span>
              <div
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: config.color }}
              />
              <span className="font-mono text-xs text-[color:var(--muted-foreground)]">
                {config.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Graph */}
      <div
        className="relative rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] p-4"
        style={{ height: graphHeight + 40 }}
      >
        <svg
          width="100%"
          height={graphHeight}
          viewBox={`0 0 ${graphWidth} ${graphHeight}`}
          preserveAspectRatio="none"
          className="absolute left-0 top-0"
        >
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((intensity) => (
            <line
              key={intensity}
              x1="0"
              y1={graphHeight - intensity * graphHeight}
              x2={graphWidth}
              y2={graphHeight - intensity * graphHeight}
              stroke="currentColor"
              strokeWidth="1"
              className="text-[color:var(--border)]"
              opacity="0.3"
            />
          ))}

          {/* Gradient definitions */}
          <defs>
            <linearGradient
              id="graphGradient"
              x1="0%"
              y1="0%"
              x2="0%"
              y2="100%"
            >
              <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.3" />
              <stop offset="50%" stopColor="#a78bfa" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#f472b6" stopOpacity="0.05" />
            </linearGradient>
            <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#fbbf24" />
              <stop offset="33%" stopColor="#a78bfa" />
              <stop offset="66%" stopColor="#f472b6" />
              <stop offset="100%" stopColor="#fbbf24" />
            </linearGradient>
          </defs>

          {/* Area under curve */}
          {mounted && (
            <path
              d={`${pathD} L ${graphWidth} ${graphHeight} L 0 ${graphHeight} Z`}
              fill="url(#graphGradient)"
              className="transition-all duration-1000"
            />
          )}

          {/* Main line */}
          {mounted && (
            <path
              d={pathD}
              fill="none"
              stroke="url(#lineGradient)"
              strokeWidth="4"
              strokeLinecap="round"
              className="transition-all duration-1000"
            />
          )}

          {/* Data points */}
          {mounted &&
            points.map((point, index) => {
              const fallback = emotionConfig.neutral
              const emotionKey = point.emotion as Emotions
              const config = emotionConfig[emotionKey] ?? fallback
              return (
                <g
                  key={index}
                  className="transition-all duration-500"
                  style={{ transitionDelay: `${index * 50}ms` }}
                >
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r="8"
                    fill={config.color}
                    className="drop-shadow-lg transition-all duration-300 hover:r-12"
                  />
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r="12"
                    fill={config.color}
                    opacity="0.3"
                    className="animate-pulse"
                  />
                </g>
              )
            })}

          {/* Current time indicator */}
          <line
            x1={currentX}
            y1="0"
            x2={currentX}
            y2={graphHeight}
            stroke="#ef4444"
            strokeWidth="3"
            strokeDasharray="8,4"
            className="animate-pulse transition-all duration-300"
          />
        </svg>

        {/* Y-axis labels */}
        <div className="absolute left-2 top-4 flex h-[300px] flex-col justify-between font-mono text-xs text-[color:var(--muted-foreground)]">
          <span>1.0</span>
          <span>0.75</span>
          <span>0.5</span>
          <span>0.25</span>
          <span>0.0</span>
        </div>
      </div>

      {/* X-axis */}
      <div className="mt-4 flex justify-between px-4 font-mono text-xs text-[color:var(--muted-foreground)]">
        <span>0:00</span>
        <span>15:00</span>
        <span>30:00</span>
        <span>45:00</span>
      </div>
    </div>
  )
}
