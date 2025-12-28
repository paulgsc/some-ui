import { useCallback, useEffect, useRef, useState } from "react"
import type { UseAudioTTSOptions } from "@utils/types/tts-types"

type AudioSpeechReturn = {
  play: (audioBuffer: ArrayBuffer) => Promise<void>
  stop: () => void
  pause: () => void
  resume: () => void
  setVolume: (volume: number) => void
  setPlaybackRate: (rate: number) => void
  speaking: boolean
  paused: boolean
  loading: boolean
  supported: boolean
  currentTime: number
  duration: number
}

// Check AudioContext support
const isAudioContextSupported = (): boolean =>
  typeof window !== "undefined" &&
  (window.AudioContext !== undefined ||
    (window as any).webkitAudioContext !== undefined)

export function useAudioSpeech(options: UseAudioTTSOptions): AudioSpeechReturn {
  // State
  const [speaking, setSpeaking] = useState(false)
  const [paused, setPaused] = useState(false)
  const [loading, setLoading] = useState(false)
  const [supported, setSupported] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  // Refs
  const audioContextRef = useRef<AudioContext | null>(null)
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const startTimeRef = useRef<number>(0)
  const pauseTimeRef = useRef<number>(0)
  const speechQueueRef = useRef<Promise<void>>(Promise.resolve())
  const currentOptionsRef = useRef(options)
  const cancelledRef = useRef(false)

  useEffect(() => {
    currentOptionsRef.current = options
  }, [options])

  // Initialize AudioContext
  useEffect(() => {
    const supported = isAudioContextSupported()
    setSupported(supported)
  }, [])

  const getOrCreateAudioContext = (): AudioContext => {
    if (
      !audioContextRef.current ||
      audioContextRef.current.state === "closed"
    ) {
      const AudioContextClass =
        window.AudioContext || (window as any).webkitAudioContext
      audioContextRef.current = new AudioContextClass()
    }
    return audioContextRef.current
  }

  // Cleanup audio nodes
  const cleanupNodes = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop()
        sourceNodeRef.current.disconnect()
      } catch (error) {
        // Node may already be stopped
      }
      sourceNodeRef.current = null
    }

    if (gainNodeRef.current) {
      try {
        gainNodeRef.current.disconnect()
      } catch (error) {
        // Node may already be disconnected
      }
      gainNodeRef.current = null
    }
  }, [])

  // Update time and progress
  const updateTime = useCallback(() => {
    const ctx = getOrCreateAudioContext()
    if (ctx && speaking && !paused) {
      const elapsed = ctx.currentTime - startTimeRef.current
      setCurrentTime(elapsed)
      currentOptionsRef.current.onProgress?.(elapsed, duration)

      if (elapsed < duration) {
        animationFrameRef.current = requestAnimationFrame(updateTime)
      }
    }
  }, [speaking, paused, duration])

  // Play audio buffer
  const play = useCallback(
    async (audioBuffer: ArrayBuffer): Promise<void> => {
      // Queue the speech to prevent overlapping
      const newSpeechPromise = new Promise<void>(async (resolve) => {
        try {
          // Wait for previous speech to complete
          await speechQueueRef.current

          getOrCreateAudioContext()
          if (!supported || !audioContextRef.current) {
            throw new Error("AudioContext not supported or not initialized")
          }

          setLoading(true)
          cleanupNodes()
          cancelledRef.current = false

          // Resume context if suspended
          if (audioContextRef.current.state === "suspended") {
            await audioContextRef.current.resume()
          }

          // Decode audio data
          let decodedBuffer: AudioBuffer
          try {
            decodedBuffer = await audioContextRef.current.decodeAudioData(
              audioBuffer.slice()
            )
          } catch (error) {
            throw new Error(`Audio decoding failed: ${error}`)
          }

          // Create and connect audio nodes
          const sourceNode = audioContextRef.current.createBufferSource()
          const gainNode = audioContextRef.current.createGain()

          sourceNode.buffer = decodedBuffer
          gainNode.gain.value = currentOptionsRef.current.volume ?? 1
          sourceNode.playbackRate.value =
            currentOptionsRef.current.playbackRate ?? 1

          sourceNode.connect(gainNode)
          gainNode.connect(audioContextRef.current.destination)

          sourceNodeRef.current = sourceNode
          gainNodeRef.current = gainNode

          // Set duration and reset time
          setDuration(decodedBuffer.duration)
          setCurrentTime(0)
          setSpeaking(true)
          setPaused(false)
          setLoading(false)

          startTimeRef.current = audioContextRef.current.currentTime

          // Handle audio end
          sourceNode.onended = (): void => {
            setSpeaking(false)
            setPaused(false)
            setCurrentTime(0)
            if (!cancelledRef.current) {
              currentOptionsRef.current.onEnd?.()
            }
            resolve()
          }

          // Start playback
          sourceNode.start(0)
          currentOptionsRef.current.onStart?.()
          updateTime()
        } catch (error) {
          console.error(error)
          setLoading(false)
          setSpeaking(false)
          setPaused(false)
          setCurrentTime(0)
          const errorObj =
            error instanceof Error ? error : new Error("Audio playback failed")
          currentOptionsRef.current.onError?.(errorObj)
          resolve()
        }
      })

      // Update queue with error handling
      speechQueueRef.current = newSpeechPromise.catch(() => {
        // Allow queue to continue even if this speech fails
      })

      return newSpeechPromise
    },
    [supported, cleanupNodes, updateTime]
  )

  // Stop playback
  const stop = useCallback(() => {
    cleanupNodes()
    setSpeaking(false)
    setPaused(false)
    setCurrentTime(0)
    currentOptionsRef.current.onEnd?.()

    // Clear the queue by setting it to a rejected promise
    speechQueueRef.current = Promise.resolve()
  }, [cleanupNodes])

  // Pause playback
  const pause = useCallback(() => {
    if (!speaking || paused || !audioContextRef.current) return

    if (audioContextRef.current.state === "running") {
      audioContextRef.current.suspend()
      setPaused(true)
      pauseTimeRef.current = audioContextRef.current.currentTime

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
    }
  }, [speaking, paused])

  // Resume playback
  const resume = useCallback(() => {
    if (!paused || !audioContextRef.current) return

    if (audioContextRef.current.state === "suspended") {
      audioContextRef.current.resume()
      setPaused(false)
      startTimeRef.current +=
        audioContextRef.current.currentTime - pauseTimeRef.current
      updateTime()
    }
  }, [paused, updateTime])

  // Set volume
  const setVolume = useCallback((newVolume: number) => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = Math.max(0, Math.min(1, newVolume))
    }
  }, [])

  // Set playback rate
  const setPlaybackRate = useCallback((rate: number) => {
    if (sourceNodeRef.current) {
      sourceNodeRef.current.playbackRate.value = Math.max(
        0.1,
        Math.min(4, rate)
      )
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupNodes()
      setSpeaking(false)
      setPaused(false)
      setLoading(false)
      setCurrentTime(0)
      setDuration(0)
    }
  }, [cleanupNodes])

  return {
    play,
    stop,
    pause,
    resume,
    setVolume,
    setPlaybackRate,
    speaking,
    paused,
    loading,
    supported,
    currentTime,
    duration,
  }
}
