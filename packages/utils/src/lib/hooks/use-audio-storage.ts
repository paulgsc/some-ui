import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type {
  UseAudioStorageOptions,
  UseAudioStorageReturn,
} from "@utils/types/audio-storage-types"
import type {
  TTSOptions,
  UseAudioTTSOptions,
  VoiceConfig,
} from "@utils/types/tts-types"
import { BUILTIN_VOICES } from "@utils/types/tts-types"
import { apiHooks } from "maishatu-fetch-kit"
import { z } from "zod"

import { useAudioSpeech } from "./use-audio-speech"

const DEFAULT_TTS_OPTIONS: Partial<UseAudioTTSOptions> = {
  volume: 1,
  playbackRate: 1,
  autoPlay: true,
} as const

const DEFAULT_FETCH_OPTIONS: Partial<UseAudioStorageOptions> = {
  staleTime: 5 * 60 * 1000, // 5 minutes
  cacheTime: 10 * 60 * 1000, // 10 minutes
} as const
// Schema for validating audio response (ArrayBuffer)
const audioArrayBufferSchema = z.instanceof(ArrayBuffer)

type Options = {
  ttsOptions: UseAudioTTSOptions
  fetchOptions: UseAudioStorageOptions
}

const generateAudioId = (text: string, voice: VoiceConfig): string => {
  const textHash = btoa(text.slice(0, 100)).replace(/[+/=]/g, "")
  const voiceId = voice.id || voice.name
  return `${voiceId}_${textHash}`
}

export function useAudioFromStorage({
  ttsOptions,
  fetchOptions,
}: Options): UseAudioStorageReturn {
  const [options, setOptions] = useState<Options>(() => ({
    ttsOptions: { ...DEFAULT_TTS_OPTIONS, ...ttsOptions },
    fetchOptions: { ...DEFAULT_FETCH_OPTIONS, ...fetchOptions },
  }))

  const optionsRef = useRef(options)
  useEffect(() => {
    optionsRef.current = options
  }, [options])

  // Get available voices for the provider
  const voices = useMemo(() => {
    return [...BUILTIN_VOICES[options.ttsOptions.service.provider]]
  }, [ttsOptions.service.provider])

  // Voice selection state
  const [selectedVoice, setSelectedVoice] = useState<VoiceConfig | null>(() => {
    if (voices.length === 0) return null
    return voices.find((v) => v.provider === "openai") ?? voices[0]
  })

  const audioSpeech = useAudioSpeech(options.ttsOptions)

  // State to track current audio request
  const [currentAudioId, setCurrentAudioId] = useState<string | null>(null)
  const [currentText, setCurrentText] = useState<string | null>(null)

  // Create the query hook for fetching audio
  const useAudioQuery = useMemo(() => {
    const baseEndpoint = new URL(options.fetchOptions.service.storageEndpoint)

    return apiHooks.createQueryHook(
      baseEndpoint,
      audioArrayBufferSchema,
      "GET",
      {
        staleTime: options.fetchOptions.staleTime,
        // cacheTime: options.cacheTime,
        enabled: false, // We'll enable it manually
        retry: (failureCount) => {
          if (options.fetchOptions.service.retryConfig) {
            return (
              failureCount < options.fetchOptions.service.retryConfig.maxRetries
            )
          }
          return failureCount < 3
        },
        retryDelay: (attemptIndex) => {
          if (options.fetchOptions.service.retryConfig?.delay) {
            return (
              options.fetchOptions.service.retryConfig.delay *
              Math.pow(2, attemptIndex)
            )
          }
          return Math.min(1000 * 2 ** attemptIndex, 30000)
        },
      }
    )
  }, [
    options.fetchOptions.service.storageEndpoint,
    options.fetchOptions.staleTime,
    options.fetchOptions.service.retryConfig,
  ])

  // Use the query hook with current audio parameters
  const audioQuery = useAudioQuery(
    currentAudioId
      ? {
          // Use ID as path parameter (assuming endpoint like /audio/:id)
          id: currentAudioId,
          // Add search query parameter for fuzzy matching
          ...(currentText && { q: currentText.slice(0, 100) }),
          // Add voice parameter for additional filtering
          ...(selectedVoice && {
            voice: selectedVoice.id || selectedVoice.name,
          }),
        }
      : {},
    {
      enabled: !!currentAudioId,
    }
  )

  // Handle query errors using the modern approach
  useEffect(() => {
    if (audioQuery.error) {
      console.error("Audio fetch error:", audioQuery.error)
      const errorObj =
        audioQuery.error instanceof Error
          ? audioQuery.error
          : new Error("Audio fetch failed")
      optionsRef.current.fetchOptions.onError?.(errorObj)
    }
  }, [audioQuery.error])

  // Effect to play audio when data is available
  useEffect(() => {
    if (audioQuery.data && options.fetchOptions.autoPlay) {
      audioSpeech.play(audioQuery.data).catch((error) => {
        console.error("Audio play error:", error)
        const errorObj =
          error instanceof Error ? error : new Error("Audio playback failed")
        optionsRef.current.fetchOptions.onError?.(errorObj)
      })
    }
  }, [audioQuery.data, options.fetchOptions.autoPlay, audioSpeech])

  const updateOptions = useCallback((newOptions: TTSOptions) => {
    setOptions((prev) => ({ ...prev, ...newOptions }))
  }, [])

  // Speak function that triggers audio fetch and play
  const speak = useCallback(
    async (text: string): Promise<void> => {
      if (!text.trim() || !selectedVoice) {
        console.warn("Cannot speak: text is empty or no voice selected")
        return
      }

      try {
        const audioId = generateAudioId(text, selectedVoice)
        setCurrentAudioId(audioId)
        setCurrentText(text)

        // If autoPlay is false, we need to manually trigger play after fetch
        if (!options.ttsOptions.autoPlay) {
          // Wait for the query to complete
          const result = await audioQuery.refetch()
          if (result.data) {
            await audioSpeech.play(result.data)
          }
        }
      } catch (error) {
        console.error("Audio speak error:", error)
        const errorObj =
          error instanceof Error ? error : new Error("Audio speak failed")
        optionsRef.current.fetchOptions.onError?.(errorObj)
        throw errorObj
      }
    },
    [selectedVoice, options.ttsOptions.autoPlay, audioSpeech, audioQuery]
  )

  // Clear current audio params when stopping
  const stop = useCallback(() => {
    audioSpeech.stop()
    setCurrentAudioId(null)
    setCurrentText(null)
  }, [audioSpeech])

  // Function to search for existing audio files
  const searchAudio = useCallback(
    async (searchQuery: string): Promise<Array<string>> => {
      try {
        // This would use a separate search endpoint
        // You might want to create another query hook for search
        const searchEndpoint = new URL(
          `${options.fetchOptions.service.storageEndpoint}/search`
        )
        const response = await fetch(
          `${searchEndpoint}?q=${encodeURIComponent(searchQuery)}`
        )

        if (!response.ok) {
          throw new Error(`Search failed: ${response.status}`)
        }

        const results = await response.json()
        return Array.isArray(results) ? results : []
      } catch (error) {
        console.error("Audio search error:", error)
        return []
      }
    },
    [options.fetchOptions.service.storageEndpoint]
  )

  return {
    speak,
    stop,
    pause: audioSpeech.pause,
    resume: audioSpeech.resume,
    setVolume: audioSpeech.setVolume,
    setPlaybackRate: audioSpeech.setPlaybackRate,
    updateOptions,
    speaking: audioSpeech.speaking,
    paused: audioSpeech.paused,
    loading: audioSpeech.loading || audioQuery.isLoading,
    supported: audioSpeech.supported,
    currentTime: audioSpeech.currentTime,
    duration: audioSpeech.duration,
    voices,
    selectedVoice,
    setSelectedVoice,
    // Storage-specific functionality
    error: audioQuery.error,
    refetch: audioQuery.refetch,
    searchAudio,
    currentAudioId,
  }
}
