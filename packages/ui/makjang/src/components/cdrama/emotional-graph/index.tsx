import { useMemo } from "react"
import { TrendingUp } from "lucide-react"

interface EmotionalDataPoint {
  minute: number
  emotion: string
  intensity: number
  notes: string
}

interface EmotionalGraphProps {
  data: EmotionalDataPoint[]
  currentMinute: number
}

const emotionColors: Record<string, string> = {
  joy: "#22d3ee",
  sadness: "#818cf8",
  fear: "#f472b6",
  anger: "#fb923c",
  surprise: "#a78bfa",
  disgust: "#4ade80",
  neutral: "#94a3b8",
}

export function EmotionalGraph({ data, currentMinute }: EmotionalGraphProps) {
  const maxIntensity = 1
  const graphHeight = 300
  const graphWidth = 800

  const points = useMemo(() => {
    return data.map((point, index) => {
      const x = (point.minute / 45) * graphWidth
      const y = graphHeight - (point.intensity / maxIntensity) * graphHeight
      return { x, y, ...point }
    })
  }, [data])

  const pathD = useMemo(() => {
    if (points.length === 0) return ""

    let path = `M ${points[0].x} ${points[0].y}`
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1]
      const curr = points[i]
      const cpX = (prev.x + curr.x) / 2
      path += ` Q ${cpX} ${prev.y}, ${curr.x} ${curr.y}`
    }
    return path
  }, [points])

  const currentX = (currentMinute / 45) * graphWidth

  return (
    <div className="relative overflow-hidden rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-slate-900/90 via-blue-900/70 to-purple-900/90 p-6 backdrop-blur-xl">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <TrendingUp className="h-5 w-5 text-cyan-400" />
          <h2 className="font-mono text-lg font-bold uppercase tracking-wider text-white">
            Emotional Roller Coaster
          </h2>
        </div>
        <div className="flex gap-2">
          {Object.entries(emotionColors).map(([emotion, color]) => (
            <div key={emotion} className="flex items-center gap-1">
              <div
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span className="font-mono text-xs text-slate-400">
                {emotion}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="relative" style={{ height: graphHeight }}>
        <svg
          width="100%"
          height={graphHeight}
          viewBox={`0 0 ${graphWidth} ${graphHeight}`}
          preserveAspectRatio="none"
          className="absolute inset-0"
        >
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((intensity) => (
            <line
              key={intensity}
              x1="0"
              y1={graphHeight - intensity * graphHeight}
              x2={graphWidth}
              y2={graphHeight - intensity * graphHeight}
              stroke="rgba(100, 200, 255, 0.1)"
              strokeWidth="1"
            />
          ))}

          {/* Gradient fill under curve */}
          <defs>
            <linearGradient
              id="graphGradient"
              x1="0%"
              y1="0%"
              x2="0%"
              y2="100%"
            >
              <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#a78bfa" stopOpacity="0.05" />
            </linearGradient>
          </defs>

          {/* Area under curve */}
          <path
            d={`${pathD} L ${graphWidth} ${graphHeight} L 0 ${graphHeight} Z`}
            fill="url(#graphGradient)"
          />

          {/* Main line */}
          <path
            d={pathD}
            fill="none"
            stroke="url(#lineGradient)"
            strokeWidth="3"
            strokeLinecap="round"
          />

          <defs>
            <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#22d3ee" />
              <stop offset="50%" stopColor="#a78bfa" />
              <stop offset="100%" stopColor="#f472b6" />
            </linearGradient>
          </defs>

          {/* Data points */}
          {points.map((point, index) => (
            <g key={index}>
              <circle
                cx={point.x}
                cy={point.y}
                r="6"
                fill={emotionColors[point.emotion]}
                className="drop-shadow-lg"
              />
              <circle
                cx={point.x}
                cy={point.y}
                r="10"
                fill={emotionColors[point.emotion]}
                opacity="0.2"
                className="animate-pulse"
              />
            </g>
          ))}

          {/* Current time indicator */}
          <line
            x1={currentX}
            y1="0"
            x2={currentX}
            y2={graphHeight}
            stroke="#ef4444"
            strokeWidth="2"
            strokeDasharray="5,5"
            className="animate-pulse"
          />
        </svg>

        {/* Y-axis labels */}
        <div className="absolute left-0 top-0 flex h-full flex-col justify-between py-2 text-xs text-slate-400">
          <span>1.0</span>
          <span>0.75</span>
          <span>0.5</span>
          <span>0.25</span>
          <span>0.0</span>
        </div>
      </div>

      {/* X-axis */}
      <div className="mt-2 flex justify-between text-xs text-slate-400">
        <span>0:00</span>
        <span>15:00</span>
        <span>30:00</span>
        <span>45:00</span>
      </div>
    </div>
  )
}
