import type { FC } from "react"
import { useCallback, useEffect, useState } from "react"

type WaveBarChartProps = {
  width: number
  height: number
  bars: number
  amplitude: number
  frequency: number
  speed: number
}

export const WaveBarChart: FC<WaveBarChartProps> = ({
  width,
  height,
  bars,
  amplitude,
  frequency,
  speed,
}) => {
  const [phase, setPhase] = useState(0)
  const barWidth = width / bars
  const midHeight = height / 2

  const generateWaveData = useCallback(() => {
    return Array.from({ length: bars }, (_, i) => {
      const x = (i / bars) * Math.PI * 2 * frequency + phase
      const y = Math.sin(x) * amplitude
      return { x: i * barWidth, y: midHeight - y }
    })
  }, [bars, amplitude, frequency, phase, barWidth, midHeight])

  useEffect(() => {
    let animationFrameId: number

    const animate = () => {
      setPhase((prevPhase) => (prevPhase + speed / 100) % (Math.PI * 2))
      animationFrameId = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId)
      }
    }
  }, [speed])

  const waveData = generateWaveData()

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <line
        x1="0"
        y1={midHeight}
        x2={width}
        y2={midHeight}
        stroke="black"
        strokeWidth="1"
      />
      <line x1="0" y1="0" x2="0" y2={height} stroke="black" strokeWidth="1" />
      {waveData.map((point, index) => (
        <rect
          key={index}
          x={point.x}
          y={point.y < midHeight ? point.y : midHeight}
          width={barWidth - 1}
          height={Math.abs(point.y - midHeight)}
          fill="hsl(var(--primary))"
        />
      ))}
    </svg>
  )
}
