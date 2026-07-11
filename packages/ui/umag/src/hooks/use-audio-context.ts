import { useCallback, useEffect, useState } from "react"

type UseAudioContextReturn = {
  audioContext: AudioContext | null
  analyser: AnalyserNode | null
  gainNode: GainNode | null
  initialize: () => void
}

type AudioNodes = {
  audioContext: AudioContext
  analyser: AnalyserNode
  gainNode: GainNode
}

export function useAudioContext(): UseAudioContextReturn {
  const [nodes, setNodes] = useState<AudioNodes | null>(null)

  const initialize = useCallback((): void => {
    setNodes((current) => {
      if (current !== null) {
        return current
      }

      const audioContext = new AudioContext()

      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 2048

      const gainNode = audioContext.createGain()

      gainNode.connect(analyser)
      analyser.connect(audioContext.destination)

      return {
        audioContext,
        analyser,
        gainNode,
      }
    })
  }, [])

  useEffect(() => {
    return (): void => {
      if (nodes !== null) {
        void nodes.audioContext.close()
      }
    }
  }, [nodes])

  return {
    audioContext: nodes?.audioContext ?? null,
    analyser: nodes?.analyser ?? null,
    gainNode: nodes?.gainNode ?? null,
    initialize,
  }
}
