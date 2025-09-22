import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type {
  TTSOptions,
  UseAudioTTSOptions,
  UseAudioTTSReturn,
  VoiceConfig,
} from "@utils/types/tts-types"
import { BUILTIN_VOICES } from "@utils/types/tts-types"

import { useAudioSpeech } from "./use-audio-speech"
import { useTTSFetch } from "./use-tts-fetch"

const DEFAULT_OPTIONS: Partial<UseAudioTTSOptions> = {
  volume: 1,
  playbackRate: 1,
  autoPlay: true,
} as const

export function useAudioTTS(
  initialOptions: UseAudioTTSOptions
): UseAudioTTSReturn {
  const [options, setOptions] = useState<UseAudioTTSOptions>(() => ({
    ...DEFAULT_OPTIONS,
    ...initialOptions,
  }))

  const optionsRef = useRef(options)

  useEffect(() => {
    optionsRef.current = options
  }, [options])

  const { fetchTTS } = useTTSFetch()

  // Get available voices for the provider
  const voices = useMemo(() => {
    return BUILTIN_VOICES[options.service.provider]
  }, [initialOptions.service.provider])

  // Voice selection state
  const [selectedVoice, setSelectedVoice] = useState<VoiceConfig | null>(() => {
    if (voices.length === 0) return null
    return voices.find((v) => v.provider === "openai") ?? voices[0]
  })

  const audioSpeech = useAudioSpeech(options)

  const updateOptions = useCallback((newOptions: TTSOptions) => {
    setOptions((prev) => ({ ...prev, ...newOptions }))
  }, [])

  // Speak function that combines fetch and play
  const speak = useCallback(
    async (text: string): Promise<void> => {
      // Use optionsRef.current to get the latest options without recreating 'speak'
      const currentOptions = optionsRef.current

      if (!text.trim() || !selectedVoice) {
        console.warn("Cannot speak: text is empty or no voice selected")
        return
      }

      try {
        // Fetch audio data
        const audioData = await fetchTTS(
          text,
          initialOptions.service,
          currentOptions.voice ?? selectedVoice
        )

        await audioSpeech.play(audioData)
      } catch (error) {
        console.error("TTS speak error:", error)
        const errorObj =
          error instanceof Error ? error : new Error("TTS failed")
        currentOptions.onError?.(errorObj)
        throw errorObj
      }
    },
    [selectedVoice, fetchTTS, audioSpeech]
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
