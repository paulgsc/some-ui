import { useEffect, useState } from "react"

type WaveFormData = Record<"x" | "y", number>

export function useWaveformVisualization(
  analyser: AnalyserNode | null,
  bars: number,
  height: number,
  width: number
): Array<WaveFormData> {
  const barWidth = width / bars
  const midHeight = height / 2
  const [waveformData, setWaveformData] = useState<Array<WaveFormData>>(
    new Array(bars).fill(height / 2)
  )

  useEffect(() => {
    if (!analyser) return

    let animationId: number

    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)

    const draw = (): void => {
      animationId = requestAnimationFrame(draw)
      analyser.getByteTimeDomainData(dataArray)

      const sampledData = Array.from({ length: bars }, (_, i) => {
        const index = Math.floor((i / bars) * bufferLength)
        const value = dataArray[index] ?? 0
        return {
          x: i * barWidth,
          y: ((value - 128) / 128) * height * 0.4 + midHeight,
        }
      })

      setWaveformData(sampledData)
    }

    draw()

    return (): void => cancelAnimationFrame(animationId)
  }, [barWidth, midHeight, analyser, bars, height])

  return waveformData
}
