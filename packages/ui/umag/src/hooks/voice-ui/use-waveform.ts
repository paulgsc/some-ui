import { useRef } from "react"

type UseWaveformReturn = {
  waveformData: React.MutableRefObject<Array<number>>
  targetWaveform: React.MutableRefObject<Array<number>>
  updateWaveform: (isActive: boolean, time: number) => void
  getAverageAmplitude: () => number
}

export const useWaveform = (): UseWaveformReturn => {
  const waveformData = useRef<Array<number>>(new Array(48).fill(0))
  const targetWaveform = useRef<Array<number>>(new Array(48).fill(0))

  const updateWaveform = (isActive: boolean, time: number): void => {
    const target = targetWaveform.current
    const waveform = waveformData.current

    if (isActive) {
      for (let i = 0; i < target.length; i++) {
        const freq1 = Math.sin(time * 3 + i * 0.4) * 0.4
        const freq2 = Math.sin(time * 7 + i * 0.2) * 0.2
        const freq3 = Math.sin(time * 11 + i * 0.1) * 0.15
        const envelope = Math.sin(time * 2) * 0.3 + 0.7

        target[i] =
          (freq1 + freq2 + freq3) * envelope * (0.6 + Math.random() * 0.4)
      }
    } else {
      for (const [i, value] of target.entries()) {
        target[i] = value * 0.92
      }
    }

    // Smooth interpolation
    for (const [i, value] of waveform.entries()) {
      const targetValue = target[i]
      if (!targetValue) continue
      waveform[i] = value + (targetValue - value) * 0.15
    }
  }

  const getAverageAmplitude = (): number => {
    const waveform = waveformData.current

    return (
      waveform.reduce((sum, val) => sum + Math.abs(val), 0) / waveform.length
    )
  }

  return {
    waveformData,
    targetWaveform,
    updateWaveform,
    getAverageAmplitude,
  }
}
