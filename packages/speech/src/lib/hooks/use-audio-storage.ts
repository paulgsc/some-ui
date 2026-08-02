import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { apiHooks } from "@some-ui/fetch-kit"
import type {
  UseAudioStorageOptions,
  UseAudioStorageReturn,
} from "@speech/lib/types/audio-storage-types"
import type {
  TTSOptions,
  UseAudioTTSOptions,
  VoiceConfig,
} from "@speech/lib/types/tts-types"
import { BUILTIN_VOICES } from "@speech/lib/types/tts-types"
import { z } from "zod"

import { useAudioPlayer } from "./use-audio-player"

const DEFAULT_TTS_OPTIONS: Partial<UseAudioTTSOptions> = {
  volume: 1,
  playbackRate: 1,
  autoPlay: true,
} as const

const DEFAULT_FETCH_OPTIONS: Partial<UseAudioStorageOptions> = {
  staleTime: 5 * 60 * 1000, // 5 minutes
  cacheTime: 10 * 60 * 1000, // 10 minutes
} as const

/** The playback knobs `PlayOptions` shares with the TTS option bag. */
const playOptions = (
  ttsOptions: UseAudioTTSOptions
): {
  volume?: number
  playbackRate?: number
  onStart?: () => void
  onEnd?: () => void
  onProgress?: (currentTime: number, duration: number) => void
} => ({
  volume: ttsOptions.volume,
  playbackRate: ttsOptions.playbackRate,
  onStart: ttsOptions.onStart,
  onEnd: ttsOptions.onEnd,
  onProgress: ttsOptions.onProgress,
})

// Schema for CachedAudio response from your backend
const cachedAudioSchema = z.object({
  id: z.string(),
  data: z.string(), // base64 encoded audio data
  metadata: z
    .object({
      text: z.string().optional(),
      voice: z.string().optional(),
      created_at: z.string().optional(),
      file_size: z.number().optional(),
    })
    .optional(),
})

// Schema for search response
const audioSearchResponseSchema = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      text: z.string().optional(),
      voice: z.string().optional(),
      score: z.number().optional(),
    })
  ),
  total: z.number(),
  page: z.number().optional(),
  limit: z.number().optional(),
})

type CachedAudio = z.infer<typeof cachedAudioSchema>
type AudioSearchResponse = z.infer<typeof audioSearchResponseSchema>

type Options = {
  ttsOptions: UseAudioTTSOptions
  fetchOptions: UseAudioStorageOptions
}

const generateAudioId = (text: string, voice: VoiceConfig): string => {
  const textHash = btoa(text.slice(0, 100)).replace(/[+/=]/g, "")
  const voiceId = voice.id || voice.name
  return `${voiceId}_${textHash}`
}

// Helper function to convert base64 to ArrayBuffer
const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes.buffer
}

export function useAudioFromStorage({
  ttsOptions,
  fetchOptions,
}: Options): UseAudioStorageReturn<AudioSearchResponse> {
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
  }, [options.ttsOptions.service.provider])

  // Voice selection state
  const [selectedVoice, setSelectedVoice] = useState<VoiceConfig | null>(() => {
    if (voices.length === 0) return null
    return voices.find((v) => v.provider === "openai") ?? voices.at(0) ?? null
  })

  const { player, state: playerState } = useAudioPlayer()

  // State to track current audio request
  const [currentAudioId, setCurrentAudioId] = useState<string | null>(null)
  const [currentText, setCurrentText] = useState<string | null>(null)

  // Create the query hook for fetching audio
  const useAudioQuery = useMemo(() => {
    const baseEndpoint = new URL(options.fetchOptions.service.storageEndpoint)

    return apiHooks.createQueryHook(baseEndpoint, cachedAudioSchema, "GET", {
      staleTime: options.fetchOptions.staleTime,
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
    })
  }, [
    options.fetchOptions.service.storageEndpoint,
    options.fetchOptions.staleTime,
    options.fetchOptions.service.retryConfig,
  ])

  // Create search query hook
  const useSearchQuery = useMemo(() => {
    const baseEndpoint = new URL(options.fetchOptions.service.storageEndpoint)

    return apiHooks.createQueryHook(
      baseEndpoint,
      audioSearchResponseSchema,
      "GET",
      {
        staleTime: options.fetchOptions.staleTime,
        enabled: false,
        retry: (failureCount) => failureCount < 2,
      }
    )
  }, [
    options.fetchOptions.service.storageEndpoint,
    options.fetchOptions.staleTime,
  ])

  // Use the query hook with current audio parameters
  const audioQuery = useAudioQuery(
    currentAudioId
      ? {
          // Use the correct endpoint path
          endpoint: `get_audio/${currentAudioId}`,
          // Add query parameters as strings
          ...(currentText && { q: currentText.slice(0, 100) }),
          // Add voice parameter for additional filtering
          ...(selectedVoice && {
            voice: selectedVoice.id || selectedVoice.name,
          }),
          force_refresh: "false", // Convert boolean to string
        }
      : {},
    {
      enabled: !!currentAudioId,
    }
  )

  const searchQuery = useSearchQuery({}, { enabled: false })

  // Handle query errors
  useEffect(() => {
    if (audioQuery.error) {
      // eslint-disable-next-line no-console
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
      try {
        // Convert base64 data to ArrayBuffer
        const audioBuffer = base64ToArrayBuffer(audioQuery.data.data)

        player
          .play(audioBuffer, playOptions(options.ttsOptions))
          .catch((error) => {
            // eslint-disable-next-line no-console
            console.error("Audio play error:", error)
            const errorObj =
              error instanceof Error
                ? error
                : new Error("Audio playback failed")
            optionsRef.current.fetchOptions.onError?.(errorObj)
          })
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("Audio data conversion error:", error)
        const errorObj =
          error instanceof Error
            ? error
            : new Error("Audio data conversion failed")
        optionsRef.current.fetchOptions.onError?.(errorObj)
      }
    }
  }, [
    audioQuery.data,
    options.fetchOptions.autoPlay,
    options.ttsOptions,
    player,
  ])

  const updateOptions = useCallback((newOptions: TTSOptions) => {
    setOptions((prev) => ({ ...prev, ...newOptions }))
  }, [])

  // Speak function that triggers audio fetch and play
  const speak = useCallback(
    async (text: string): Promise<void> => {
      if (!text.trim() || !selectedVoice) {
        // eslint-disable-next-line no-console
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
            const audioBuffer = base64ToArrayBuffer(result.data.data)
            await player.play(audioBuffer, playOptions(options.ttsOptions))
          }
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("Audio speak error:", error)
        const errorObj =
          error instanceof Error ? error : new Error("Audio speak failed")
        optionsRef.current.fetchOptions.onError?.(errorObj)
        throw errorObj
      }
    },
    [selectedVoice, options.ttsOptions, player, audioQuery]
  )

  // Clear current audio params when stopping
  const stop = useCallback(() => {
    player.stop()
    setCurrentAudioId(null)
    setCurrentText(null)
  }, [player])

  // Function to search for existing audio files
  const searchAudio = useCallback(
    async (limit?: number, page?: number): Promise<AudioSearchResponse> => {
      try {
        const result = await searchQuery.refetch()

        if (result.data) {
          return result.data
        }
        throw new Error("No search results returned")
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("Audio search error:", error)
        // Return empty response on error
        return {
          results: [],
          total: 0,
          page: page || 1,
          limit: limit || 10,
        }
      }
    },
    [searchQuery]
  )

  // Function to get audio by specific ID
  const getAudioById = useCallback(
    async (id: string): Promise<CachedAudio | null> => {
      try {
        const prevAudioId = currentAudioId
        setCurrentAudioId(id)

        const result = await audioQuery.refetch()

        // Restore previous audio ID if this was just a fetch
        if (prevAudioId !== id) {
          setCurrentAudioId(prevAudioId)
        }

        return result.data ?? null
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("Get audio by ID error:", error)
        return null
      }
    },
    [audioQuery, currentAudioId]
  )

  return {
    speak,
    stop,
    pause: player.pause,
    resume: player.resume,
    setVolume: player.setVolume,
    setPlaybackRate: player.setPlaybackRate,
    updateOptions,
    speaking: playerState.speaking,
    paused: playerState.paused,
    loading:
      playerState.loading || audioQuery.isLoading || searchQuery.isLoading,
    supported: player.supported,
    currentTime: playerState.currentTime,
    duration: playerState.duration,
    voices,
    selectedVoice,
    setSelectedVoice,
    // Storage-specific functionality
    error: audioQuery.error || searchQuery.error,
    refetch: audioQuery.refetch,
    searchAudio,
    getAudioById,
    currentAudioId,
    // Additional data access
    currentAudioData: audioQuery.data,
    searchResults: searchQuery.data,
  }
}
