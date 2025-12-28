import { useRef } from "react"

export const useWaveform = () => {
  const waveformData = useRef<Array<number>>(new Array(48).fill(0))
  const targetWaveform = useRef<Array<number>>(new Array(48).fill(0))

  const updateWaveform = (isActive: boolean, time: number) => {
    if (isActive) {
      for (let i = 0; i < targetWaveform.current.length; i++) {
        const freq1 = Math.sin(time * 3 + i * 0.4) * 0.4
        const freq2 = Math.sin(time * 7 + i * 0.2) * 0.2
        const freq3 = Math.sin(time * 11 + i * 0.1) * 0.15
        const envelope = Math.sin(time * 2) * 0.3 + 0.7

        targetWaveform.current[i] =
          (freq1 + freq2 + freq3) * envelope * (0.6 + Math.random() * 0.4)
      }
    } else {
      for (let i = 0; i < targetWaveform.current.length; i++) {
        targetWaveform.current[i] *= 0.92
      }
    }

    // Smooth interpolation
    for (let i = 0; i < waveformData.current.length; i++) {
      waveformData.current[i] +=
        (targetWaveform.current[i] - waveformData.current[i]) * 0.15
    }
  }

  const getAverageAmplitude = () => {
    return (
      waveformData.current.reduce((sum, val) => sum + Math.abs(val), 0) /
      waveformData.current.length
    )
  }

  return { waveformData, targetWaveform, updateWaveform, getAverageAmplitude }
}
