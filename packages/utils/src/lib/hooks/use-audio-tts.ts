import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useAudioSpeech } from "@utils/lib/hooks/use-audio-speech"
import { useTTSFetch } from "@utils/lib/hooks/use-tts-fetch"
import type {
  UseAudioTTSOptions,
  UseAudioTTSReturn,
  VoiceConfig,
} from "@utils/types/tts-types"
import { BUILTIN_VOICES } from "@utils/types/tts-types"

const DEFAULT_OPTIONS: Partial<UseAudioTTSOptions> = {
  volume: 1,
  playbackRate: 1,
  autoPlay: true,
} as const

export function useAudioTTS(
  initialOptions: UseAudioTTSOptions
): UseAudioTTSReturn {
  // State for dynamic options
  const [currentOptions, setCurrentOptions] =
    useState<UseAudioTTSOptions>(initialOptions)

  const mergedOptions = useMemo(
    () => ({
      ...DEFAULT_OPTIONS,
      ...currentOptions,
    }),
    [currentOptions]
  )

  const { fetchTTS } = useTTSFetch()

  // Get available voices for the provider
  const voices = useMemo(() => {
    return BUILTIN_VOICES[mergedOptions.service.provider]
  }, [mergedOptions.service.provider])

  // Voice selection state
  const [selectedVoice, setSelectedVoice] = useState<VoiceConfig | null>(() => {
    if (voices.length === 0) return null
    return voices.find((v) => v.provider === "openai") ?? voices[0]
  })

  // Update selected voice when provider changes and current voice is incompatible
  useEffect(() => {
    if (
      selectedVoice &&
      selectedVoice.provider !== mergedOptions.service.provider
    ) {
      const newVoice =
        voices.find((v) => v.provider === mergedOptions.service.provider) ??
        voices[0] ??
        null
      setSelectedVoice(newVoice)
    } else if (!selectedVoice && voices.length > 0) {
      setSelectedVoice(voices.find((v) => v.provider === "openai") ?? voices[0])
    }
  }, [voices, selectedVoice, mergedOptions.service.provider])

  // Store audio speech options in ref to update them dynamically
  const audioSpeechOptionsRef = useRef({
    volume: mergedOptions.volume,
    playbackRate: mergedOptions.playbackRate,
    callbacks: {
      onStart: mergedOptions.onStart,
      onEnd: mergedOptions.onEnd,
      onError: mergedOptions.onError,
      onProgress: mergedOptions.onProgress,
    },
  })

  // Update audio speech options when merged options change
  useEffect(() => {
    audioSpeechOptionsRef.current = {
      volume: mergedOptions.volume,
      playbackRate: mergedOptions.playbackRate,
      callbacks: {
        onStart: mergedOptions.onStart,
        onEnd: mergedOptions.onEnd,
        onError: mergedOptions.onError,
        onProgress: mergedOptions.onProgress,
      },
    }
  }, [mergedOptions])

  // Audio speech hook with callbacks
  const audioSpeech = useAudioSpeech(audioSpeechOptionsRef.current)

  // Update options function
  const updateOptions = useCallback(
    (newOptions: Partial<UseAudioTTSOptions>) => {
      setCurrentOptions((prev) => {
        const updatedService = newOptions.service
          ? { ...prev.service, ...newOptions.service }
          : prev.service

        return {
          ...prev,
          ...newOptions,
          service: updatedService,
        }
      })
    },
    []
  )

  // Speak function that combines fetch and play
  const speak = useCallback(
    async (text: string): Promise<void> => {
      if (!text.trim() || !selectedVoice) {
        console.warn("Cannot speak: text is empty or no voice selected")
        return
      }

      try {
        // Fetch audio data
        const audioData = await fetchTTS(
          text,
          selectedVoice,
          mergedOptions.service
        )

        // Play the audio
        await audioSpeech.play(audioData)
      } catch (error) {
        console.error("TTS speak error:", error)
        const errorObj =
          error instanceof Error ? error : new Error("TTS failed")
        mergedOptions.onError?.(errorObj)
        throw errorObj
      }
    },
    [
      selectedVoice,
      fetchTTS,
      mergedOptions.service,
      mergedOptions.onError,
      audioSpeech,
    ]
  )

  return {
    speak,
    stop: audioSpeech.stop,
    pause: audioSpeech.pause,
    resume: audioSpeech.resume,
    setVolume: audioSpeech.setVolume,
    setPlaybackRate: audioSpeech.setPlaybackRate,
    updateOptions,
    speaking: audioSpeech.speaking,
    paused: audioSpeech.paused,
    loading: audioSpeech.loading,
    supported: audioSpeech.supported,
    currentTime: audioSpeech.currentTime,
    duration: audioSpeech.duration,
    voices,
    selectedVoice,
    setSelectedVoice,
  }
}
