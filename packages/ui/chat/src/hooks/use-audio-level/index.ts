import { useEffect, useRef, useState } from "react"

const BAR_COUNT = 32
export const IDLE_LEVEL = 0.08
const IDLE_LEVELS: Array<number> = Array<number>(BAR_COUNT).fill(IDLE_LEVEL)

/**
 * Reduces a frequency-bin buffer into `barCount` normalized (0..1) bars by
 * averaging each contiguous `bucketSize`-wide slice, floored at IDLE_LEVEL so
 * bars never fully flatten to 0 while a stream is live.
 */
export const averageIntoBars = (
  data: ArrayLike<number>,
  barCount: number,
  bucketSize: number
): Array<number> => {
  const next: Array<number> = []
  for (let i = 0; i < barCount; i++) {
    let sum = 0
    for (let j = 0; j < bucketSize; j++) {
      sum += data[i * bucketSize + j] ?? 0
    }
    next.push(Math.max(IDLE_LEVEL, sum / bucketSize / 255))
  }
  return next
}

/**
 * Samples a live mic stream into a fixed number of normalized (0..1) bars
 * via the Web Audio API, so recording UI can react to the user's actual
 * voice instead of a canned CSS animation. Returns a flat idle array when
 * there's no stream (not recording, or unsupported browser).
 */
export const useAudioLevel = (stream: MediaStream | null): Array<number> => {
  const [levels, setLevels] = useState<Array<number>>(IDLE_LEVELS)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (!stream) return
    if (typeof window.AudioContext !== "function") return

    const audioCtx = new window.AudioContext()
    const source = audioCtx.createMediaStreamSource(stream)
    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 128
    analyser.smoothingTimeConstant = 0.75
    source.connect(analyser)

    const data = new Uint8Array(analyser.frequencyBinCount)
    const bucketSize = Math.max(1, Math.floor(data.length / BAR_COUNT))

    const tick = (): void => {
      analyser.getByteFrequencyData(data)
      setLevels(averageIntoBars(data, BAR_COUNT, bucketSize))
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)

    return (): void => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      source.disconnect()
      analyser.disconnect()
      void audioCtx.close().catch(() => {})
    }
  }, [stream])

  return stream ? levels : IDLE_LEVELS
}
