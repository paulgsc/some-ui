import { useEffect, useState } from "react"

export function useWaveformVisualization(
  analyser: AnalyserNode | null,
  bars: number,
  height: number,
  width: number
) {
  const barWidth = width / bars
  const midHeight = height / 2
  const [waveformData, setWaveformData] = useState<Array<Record<"x" | "y", number>>>(
    new Array(bars).fill(height / 2)
  )

  useEffect(() => {
    if (!analyser) return

    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)

    const draw = () => {
      const animationId = requestAnimationFrame(draw)
      analyser.getByteTimeDomainData(dataArray)

      const sampledData = Array.from({ length: bars }, (_, i) => {
        const index = Math.floor((i / bars) * bufferLength)
        const value = dataArray[index]
        return {
          x: i * barWidth,
          y: ((value - 128) / 128) * height * 0.4 + midHeight,
        }
      })

      setWaveformData(sampledData)
    }

    draw()

    return () => cancelAnimationFrame(draw)
  }, [analyser, bars, height])

  return waveformData
}
