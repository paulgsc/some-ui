import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"

// TTS Service providers
type TTSProvider = "elevenlabs" | "openai" | "google" | "azure" | "custom"

// Voice configuration for different providers
export type VoiceConfig = {
  readonly id: string
  readonly name: string
  readonly provider: TTSProvider
  readonly language?: string
  readonly gender?: "male" | "female" | "neutral"
  readonly style?: string
}

// Audio format options
type AudioFormat = "mp3" | "ogg" | "wav" | "aac" | "flac" | "pcm"

// TTS service configuration
type TTSServiceConfig = {
  readonly provider: TTSProvider
  readonly apiKey?: string
  readonly apiUrl?: string
  readonly format?: AudioFormat
  readonly sampleRate?: number
  readonly quality?: "low" | "medium" | "high"
  readonly cacheAudio?: boolean
}

// Base TTS options
type TTSOptions = {
  readonly volume?: number
  readonly playbackRate?: number
  readonly crossOrigin?: "anonymous" | "use-credentials"
}

// Hook options
type UseAudioTTSOptions = TTSOptions & {
  readonly service: TTSServiceConfig
  readonly autoPlay?: boolean
  readonly preloadVoices?: boolean
  readonly onStart?: () => void
  readonly onEnd?: () => void
  readonly onError?: (error: Error) => void
  readonly onProgress?: (currentTime: number, duration: number) => void
}

// Return interface
export type UseAudioTTSReturn = {
  readonly speak: (text: string) => Promise<void>
  readonly stop: () => void
  readonly pause: () => void
  readonly resume: () => void
  readonly setVolume: (volume: number) => void
  readonly setPlaybackRate: (rate: number) => void
  readonly speaking: boolean
  readonly paused: boolean
  readonly loading: boolean
  readonly supported: boolean
  readonly currentTime: number
  readonly duration: number
  readonly voices: ReadonlyArray<VoiceConfig>
  readonly selectedVoice: VoiceConfig | null
  readonly setSelectedVoice: (voice: VoiceConfig | null) => void
  readonly audioContext: AudioContext | null
}

// Default options - memoized to prevent recreation
const DEFAULT_OPTIONS = {
  volume: 1,
  playbackRate: 1,
  crossOrigin: "anonymous" as const,
  autoPlay: true,
  preloadVoices: true,
} as const

// Built-in voice configurations
const BUILTIN_VOICES: Record<TTSProvider, ReadonlyArray<VoiceConfig>> = {
  elevenlabs: [
    {
      id: "rachel",
      name: "Rachel",
      provider: "elevenlabs",
      language: "en-US",
      gender: "female",
    },
    {
      id: "drew",
      name: "Drew",
      provider: "elevenlabs",
      language: "en-US",
      gender: "male",
    },
    {
      id: "clyde",
      name: "Clyde",
      provider: "elevenlabs",
      language: "en-US",
      gender: "male",
    },
    {
      id: "paul",
      name: "Paul",
      provider: "elevenlabs",
      language: "en-US",
      gender: "male",
    },
  ],
  openai: [
    {
      id: "onyx",
      name: "Onyx",
      provider: "openai",
      language: "en-US",
      gender: "male",
    },
    {
      id: "echo",
      name: "Echo",
      provider: "openai",
      language: "en-US",
      gender: "male",
    },
    {
      id: "alloy",
      name: "Alloy",
      provider: "openai",
      language: "en-US",
      gender: "neutral",
    },
    {
      id: "fable",
      name: "Fable",
      provider: "openai",
      language: "en-US",
      gender: "neutral",
    },
    {
      id: "nova",
      name: "Nova",
      provider: "openai",
      language: "en-US",
      gender: "female",
    },
    {
      id: "shimmer",
      name: "Shimmer",
      provider: "openai",
      language: "en-US",
      gender: "female",
    },
  ],
  google: [
    {
      id: "en-US-Wavenet-D",
      name: "Google Male",
      provider: "google",
      language: "en-US",
      gender: "male",
    },
    {
      id: "en-US-Wavenet-F",
      name: "Google Female",
      provider: "google",
      language: "en-US",
      gender: "female",
    },
  ],
  azure: [
    {
      id: "en-US-JennyNeural",
      name: "Jenny",
      provider: "azure",
      language: "en-US",
      gender: "female",
    },
    {
      id: "en-US-GuyNeural",
      name: "Guy",
      provider: "azure",
      language: "en-US",
      gender: "male",
    },
  ],
  custom: [],
} as const

// Type guard for AudioContext support
const isAudioContextSupported = (): boolean =>
  typeof window !== "undefined" &&
  (window.AudioContext !== undefined ||
    (window as any).webkitAudioContext !== undefined)

// TTS API configuration for each provider
type TTSAPIConfig = {
  readonly url: (config: TTSServiceConfig, voice: VoiceConfig) => string
  readonly headers: (config: TTSServiceConfig) => Record<string, string>
  readonly body: (
    text: string,
    voice: VoiceConfig,
    config: TTSServiceConfig
  ) => string
  readonly processResponse: (response: Response) => Promise<ArrayBuffer>
}

// API configurations for different providers
const TTS_API_CONFIGS: Record<TTSProvider, TTSAPIConfig> = {
  elevenlabs: {
    url: (_, voice) =>
      `https://api.elevenlabs.io/v1/text-to-speech/${voice.id}`,
    headers: (config) => ({
      Accept: "audio/mpeg",
      "Content-Type": "application/json",
      "xi-api-key": config.apiKey || "",
    }),
    body: (text) =>
      JSON.stringify({
        text,
        model_id: "eleven_monolingual_v1",
        voice_settings: { stability: 0.5, similarity_boost: 0.5 },
      }),
    processResponse: (response) => response.arrayBuffer(),
  },
  openai: {
    url: (config) => config.apiUrl || "http://localhost:5050/v1/audio/speech",
    headers: (config) => ({
      Authorization: `Bearer ${config.apiKey || "your_dummy_api_key_here"}`,
      "Content-Type": "application/json",
    }),
    body: (text, voice, config) =>
      JSON.stringify({
        model: "tts-1",
        input: text,
        voice: voice.id,
        response_format: config.format || "mp3",
        speed: 1.0,
      }),
    processResponse: (response) => response.arrayBuffer(),
  },
  google: {
    url: (config) =>
      `${config.apiUrl || "https://texttospeech.googleapis.com/v1/text:synthesize"}?key=${config.apiKey}`,
    headers: () => ({ "Content-Type": "application/json" }),
    body: (text, voice, config) =>
      JSON.stringify({
        input: { text },
        voice: { languageCode: voice.language || "en-US", name: voice.id },
        audioConfig: {
          audioEncoding: config.format?.toUpperCase() || "MP3",
          sampleRateHertz: config.sampleRate || 24000,
        },
      }),
    processResponse: async (response) => {
      const data = await response.json()
      return Uint8Array.from(atob(data.audioContent), (c) => c.charCodeAt(0))
        .buffer
    },
  },
  azure: {
    url: (config) => config.apiUrl || "",
    headers: (config) => ({
      "Ocp-Apim-Subscription-Key": config.apiKey || "",
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-16khz-128kbitrate-mono-mp3",
    }),
    body: (text, voice) =>
      `<speak version="1.0" xmlns="https://www.w3.org/2001/10/synthesis" xml:lang="${voice.language || "en-US"}">
                                                                                                                                                                                                                                                                                                                                                            <voice name="${voice.id}">${text}</voice>
                                                                                                                                                                                                                                                                                                                                                        </speak>`,
    processResponse: (response) => response.arrayBuffer(),
  },
  custom: {
    url: (config) => config.apiUrl || "",
    headers: (config) => ({
      "Content-Type": "application/json",
      ...(config.apiKey && { Authorization: `Bearer ${config.apiKey}` }),
    }),
    body: (text, voice) => JSON.stringify({ text, voice: voice.id }),
    processResponse: (response) => response.arrayBuffer(),
  },
}

// Generate query key for TanStack Query
const tinyHash = (str: string): string => {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash).toString(36)
}
const createTTSQueryKey = (
  text: string,
  voice: VoiceConfig,
  config: TTSServiceConfig
): Array<string> => {
  // Truncate text for cache key to prevent excessively long keys
  const textKey = tinyHash(text)
  return [
    "tts",
    config.provider,
    voice.id,
    textKey,
    config.format || "mp3",
    config.quality || "medium",
  ]
}

// TTS synthesis function for TanStack Query
const synthesizeTTS = async (
  text: string,
  voice: VoiceConfig,
  config: TTSServiceConfig
): Promise<ArrayBuffer> => {
  const apiConfig = TTS_API_CONFIGS[config.provider]
  const url = apiConfig.url(config, voice)
  const headers = apiConfig.headers(config)
  const body = apiConfig.body(text, voice, config)
  console.info("Attempting fetch!")

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
      mode: "cors",
      credentials: "omit",
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error")
      console.error(
        `${config.provider} TTS API error: ${response.status} ${response.statusText} - ${errorText}`
      )
      throw new Error(
        `${config.provider} TTS API error: ${response.status} ${response.statusText} - ${errorText}`
      )
    }

    const result = await apiConfig.processResponse(response)
    return result
  } catch (error) {
    throw error
  }
}

// Create AudioContext helper
const createAudioContext = (): AudioContext => {
  const AudioContextClass =
    window.AudioContext || (window as any).webkitAudioContext
  return new AudioContextClass()
}

// Main hook
export function useAudioTTS(options: UseAudioTTSOptions): UseAudioTTSReturn {
  const queryClient = useQueryClient()

  // Memoize merged options to prevent recreation
  const mergedOptions = useMemo(() => {
    return { ...DEFAULT_OPTIONS, ...options }
  }, [
    options.volume,
    options.playbackRate,
    options.crossOrigin,
    options.autoPlay,
    options.preloadVoices,
    options.service.provider,
    options.service.apiKey,
    options.service.apiUrl,
    options.service.format,
    options.service.sampleRate,
    options.service.quality,
    options.service.cacheAudio,
  ])

  // State
  const [speaking, setSpeaking] = useState(false)
  const [paused, setPaused] = useState(false)
  const [loading, setLoading] = useState(false)
  const [supported, setSupported] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [voices, setVoices] = useState<ReadonlyArray<VoiceConfig>>([])
  const [selectedVoice, setSelectedVoice] = useState<VoiceConfig | null>(null)
  const [userInteracted, setUserInteracted] = useState(false)

  // Refs - stable across renders
  const audioContextRef = useRef<AudioContext | null>(null)
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const startTimeRef = useRef<number>(0)
  const pauseTimeRef = useRef<number>(0)
  const currentRequestRef = useRef<string | null>(null)

  // Store callbacks in refs to avoid recreation and prevent stale closures
  const callbacksRef = useRef({
    onStart: options.onStart,
    onEnd: options.onEnd,
    onError: options.onError,
    onProgress: options.onProgress,
  })

  // Update callbacks ref when they change
  useEffect(() => {
    callbacksRef.current = {
      onStart: options.onStart,
      onEnd: options.onEnd,
      onError: options.onError,
      onProgress: options.onProgress,
    }
  }, [options.onStart, options.onEnd, options.onError, options.onProgress])

  // Memoize available voices to prevent recreation
  const availableVoices = useMemo(() => {
    return BUILTIN_VOICES[mergedOptions.service.provider]
  }, [mergedOptions.service.provider])

  // Cleanup audio nodes - stable callback
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
        // Node may already be stopped/disconnected
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

  // Time tracking - stable callback
  const updateTime = useCallback(() => {
    if (audioContextRef.current && speaking && !paused) {
      const elapsed = audioContextRef.current.currentTime - startTimeRef.current
      setCurrentTime(elapsed)
      callbacksRef.current.onProgress?.(elapsed, duration)

      if (elapsed < duration) {
        animationFrameRef.current = requestAnimationFrame(updateTime)
      } else {
        setSpeaking(false)
        setPaused(false)
        setCurrentTime(0)
        currentRequestRef.current = null
        callbacksRef.current.onEnd?.()
      }
    }
  }, [speaking, paused, duration])

  const initializeAudioWithUserGesture = useCallback(async () => {
    if (!isAudioContextSupported()) {
      setSupported(false)
      return false
    }

    try {
      if (
        !audioContextRef.current ||
        audioContextRef.current.state === "closed"
      ) {
        audioContextRef.current = createAudioContext()
      }

      // Ensure context is running
      if (audioContextRef.current.state === "suspended") {
        await audioContextRef.current.resume()
      }

      setUserInteracted(true)
      setSupported(true)
      return true
    } catch (error) {
      console.error("Failed to initialize AudioContext:", error)
      setSupported(false)
      return false
    }
  }, [])
  // Initialize AudioContext and voices
  useEffect(() => {
    if (!isAudioContextSupported()) {
      setSupported(false)
      return
    }

    setSupported(true)

    // Initialize AudioContext
    if (
      !audioContextRef.current ||
      audioContextRef.current.state === "closed"
    ) {
      audioContextRef.current = createAudioContext()
    }

    // Load voices
    setVoices(availableVoices)

    // Set default voice only if none is selected and voices are available
    if (availableVoices.length > 0 && !selectedVoice) {
      const defaultVoice =
        availableVoices.find((v) => v.provider === "openai") ??
        availableVoices[0]
      setSelectedVoice(defaultVoice)
    }
  }, [availableVoices, selectedVoice])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupNodes()

      if (
        audioContextRef.current &&
        audioContextRef.current.state !== "closed"
      ) {
        audioContextRef.current.close()
        audioContextRef.current = null
      }

      // Reset state
      setSpeaking(false)
      setPaused(false)
      setLoading(false)
      setCurrentTime(0)
      setDuration(0)
      currentRequestRef.current = null
    }
  }, [cleanupNodes])

  // Speak function with race condition prevention
  const speak = useCallback(
    async (text: string): Promise<void> => {
      if (!userInteracted) {
        // Try to initialize on first use
        const initialized = await initializeAudioWithUserGesture()
        if (!initialized) {
          throw new Error(
            "AudioContext requires user interaction to initialize"
          )
        }
      }

      if (
        !supported ||
        !text.trim() ||
        !selectedVoice ||
        !audioContextRef.current
      ) {
        console.error("TTS speak aborted: conditions not met.", {
          supported,
          textTrimmed: text.trim().length > 0,
          selectedVoice: !!selectedVoice,
          audioContext: !!audioContextRef.current,
        })
        return
      }

      // Prevent race conditions by tracking current request
      const requestId = `${Date.now()}-${Math.random()}`
      currentRequestRef.current = requestId

      try {
        setLoading(true)
        cleanupNodes()

        if (audioContextRef.current.state === "suspended") {
          await audioContextRef.current.resume()
        }

        // Generate query key and fetch from cache or API
        const queryKey = createTTSQueryKey(
          text,
          selectedVoice,
          mergedOptions.service
        )

        const audioData = await queryClient.fetchQuery({
          queryKey,
          queryFn: () =>
            synthesizeTTS(text, selectedVoice, mergedOptions.service),
          staleTime: 5 * 60 * 1000,
          gcTime: 30 * 60 * 1000,
        })

        // Check if this request is still current
        if (currentRequestRef.current !== requestId) {
          return // Request was superseded
        }

        let audioBuffer: AudioBuffer
        try {
          audioBuffer = await audioContextRef.current.decodeAudioData(
            audioData.slice()
          )
        } catch (decodeError) {
          console.error("Audio decode error:", decodeError)
          throw new Error(`Audio decoding failed: ${decodeError}`)
        }

        // Check again after async operation
        if (
          currentRequestRef.current !== requestId ||
          !audioContextRef.current
        ) {
          return // Request was superseded or context was destroyed
        }

        const sourceNode = audioContextRef.current.createBufferSource()
        const gainNode = audioContextRef.current.createGain()

        sourceNode.buffer = audioBuffer
        gainNode.gain.value = mergedOptions.volume

        sourceNode.connect(gainNode)
        gainNode.connect(audioContextRef.current.destination)

        sourceNodeRef.current = sourceNode
        gainNodeRef.current = gainNode

        setDuration(audioBuffer.duration)
        setCurrentTime(0)
        setSpeaking(true)
        setPaused(false)
        setLoading(false)

        startTimeRef.current = audioContextRef.current.currentTime

        sourceNode.onended = () => {
          if (currentRequestRef.current === requestId) {
            setSpeaking(false)
            setPaused(false)
            setCurrentTime(0)
            currentRequestRef.current = null
            callbacksRef.current.onEnd?.()
          }
        }

        sourceNode.start(0)
        callbacksRef.current.onStart?.()
        updateTime()
      } catch (error) {
        if (currentRequestRef.current === requestId) {
          console.error("TTS Error:", error)
          setLoading(false)
          setSpeaking(false)
          currentRequestRef.current = null

          const errorObj =
            error instanceof Error ? error : new Error("TTS synthesis failed")
          callbacksRef.current.onError?.(errorObj)
          throw errorObj
        }
      }
    },
    [
      supported,
      selectedVoice,
      cleanupNodes,
      updateTime,
      mergedOptions.service,
      mergedOptions.volume,
      queryClient,
      userInteracted,
      initializeAudioWithUserGesture,
    ]
  )

  // Control functions - all stable callbacks
  const stop = useCallback((): void => {
    cleanupNodes()
    setSpeaking(false)
    setPaused(false)
    setCurrentTime(0)
    currentRequestRef.current = null
    callbacksRef.current.onEnd?.()
  }, [cleanupNodes])

  const pause = useCallback((): void => {
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

  const resume = useCallback((): void => {
    if (!paused || !audioContextRef.current) return

    if (audioContextRef.current.state === "suspended") {
      audioContextRef.current.resume()
      setPaused(false)
      startTimeRef.current +=
        audioContextRef.current.currentTime - pauseTimeRef.current
      updateTime()
    }
  }, [paused, updateTime])

  const setVolume = useCallback((newVolume: number): void => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = Math.max(0, Math.min(1, newVolume))
    }
  }, [])

  const setPlaybackRate = useCallback((rate: number): void => {
    if (sourceNodeRef.current) {
      sourceNodeRef.current.playbackRate.value = Math.max(
        0.1,
        Math.min(4, rate)
      )
    }
  }, [])

  return {
    speak,
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
    voices,
    selectedVoice,
    setSelectedVoice,
    audioContext: audioContextRef.current,
  }
}
