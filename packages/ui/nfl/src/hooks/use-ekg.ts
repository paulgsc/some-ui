import { useEffect, useRef, useState } from "react"
import type { EKGWaveParams } from "@nfl/types/ekg"
import { calculateEKGValue } from "@nfl/utils/ekg"

export const useEKGData = (
  params: EKGWaveParams,
  maxPoints: number,
  pointSpacing: number
) => {
  const [time, setTime] = useState<number>(0)
  const [points, setPoints] = useState<Array<{ x: number; y: number }>>([])
  const animationFrameRef = useRef<number | null>(null)
  const lastTimestampRef = useRef<number | null>(null)

  const updateEKG = (timestamp: number) => {
    if (!lastTimestampRef.current) {
      lastTimestampRef.current = timestamp
    }

    // Calculate time elapsed in seconds
    const elapsed = (timestamp - lastTimestampRef.current) / 1000
    lastTimestampRef.current = timestamp

    setTime((prevTime) => prevTime + elapsed)
    animationFrameRef.current = requestAnimationFrame(updateEKG)
  }

  useEffect(() => {
    animationFrameRef.current = requestAnimationFrame(updateEKG)
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const newPoints = []
    for (let i = 0; i < maxPoints; i++) {
      const x = i * pointSpacing
      const pointTime =
        time -
        ((maxPoints - i) * pointSpacing * (60.0 / params.heartRate)) / 1000
      const ekgValue = calculateEKGValue(pointTime, params)
      const y = -ekgValue // Inverted for SVG coordinate system
      newPoints.push({ x, y })
    }
    setPoints(newPoints)
  }, [time, params, maxPoints, pointSpacing])

  return points
}
