import { useEffect, useRef, useState } from "react"

type UseAudioContextReturn = {
  audioContext: AudioContext | null
  analyser: AnalyserNode | null
  gainNode: GainNode | null
}

export function useAudioContext(): UseAudioContextReturn {
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)

  useEffect(() => {
    const ctx = new (window.AudioContext ||
      (window as any).webkitAudioContext)()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 2048
    const gainNode = ctx.createGain()

    gainNode.connect(analyser)
    analyser.connect(ctx.destination)

    setAudioContext(ctx)
    analyserRef.current = analyser
    gainNodeRef.current = gainNode

    return (): void => {
      ctx.close()
    }
  }, [])

  return {
    audioContext,
    analyser: analyserRef.current,
    gainNode: gainNodeRef.current,
  }
}
