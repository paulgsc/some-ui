import { useEffect, useMemo, useRef, useState } from "react"
import type { EKGWaveParams } from "@nfl/types/ekg"
import { calculateEKGValue } from "@nfl/utils/ekg"

export const useEKGData = (
  params: EKGWaveParams,
  maxPoints: number,
  pointSpacing: number
): Array<{ x: number; y: number }> => {
  const [time, setTime] = useState(0)
  const lastTimestampRef = useRef<number | null>(null)

  useEffect(() => {
    let frame = 0

    const tick = (timestamp: number): void => {
      const last = lastTimestampRef.current

      if (last !== null) {
        setTime((time) => time + (timestamp - last) / 1000)
      }

      lastTimestampRef.current = timestamp
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)

    return (): void => {
      cancelAnimationFrame(frame)
      lastTimestampRef.current = null
    }
  }, [])

  return useMemo(() => {
    return Array.from({ length: maxPoints }, (_, i) => {
      const x = i * pointSpacing
      const pointTime =
        time - ((maxPoints - i) * pointSpacing * (60 / params.heartRate)) / 1000

      return {
        x,
        y: -calculateEKGValue(pointTime, params),
      }
    })
  }, [time, params, maxPoints, pointSpacing])
}
