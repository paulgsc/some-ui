import { useCallback, useEffect, useRef, useState } from "react"

// TTS Service providers
type TTSProvider = "elevenlabs" | "openai" | "google" | "azure" | "custom"

// Voice configuration for different providers
type VoiceConfig = {
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
type UseAudioTTSReturn = {
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

// Default options
const DEFAULT_OPTIONS: Required<
  Pick<
    UseAudioTTSOptions,
    "volume" | "playbackRate" | "crossOrigin" | "autoPlay" | "preloadVoices"
  >
> = {
  volume: 1,
  playbackRate: 1,
  crossOrigin: "anonymous",
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
      id: "alloy",
      name: "Alloy",
      provider: "openai",
      language: "en-US",
      gender: "neutral",
    },
    {
      id: "echo",
      name: "Echo",
      provider: "openai",
      language: "en-US",
      gender: "male",
    },
    {
      id: "fable",
      name: "Fable",
      provider: "openai",
      language: "en-US",
      gender: "neutral",
    },
    {
      id: "onyx",
      name: "Onyx",
      provider: "openai",
      language: "en-US",
      gender: "male",
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

// Functional TTS synthesis
const synthesizeTTS = async (
  text: string,
  voice: VoiceConfig,
  config: TTSServiceConfig,
  cache: Map<string, ArrayBuffer>
): Promise<ArrayBuffer> => {
  const cacheKey = `${config.provider}-${voice.id}-${text.slice(0, 100)}`

  if (config.cacheAudio !== false && cache.has(cacheKey)) {
    const cachedAudioData = cache.get(cacheKey)!
    return cachedAudioData.slice(0) // This
  }

  const apiConfig = TTS_API_CONFIGS[config.provider]
  const url = apiConfig.url(config, voice)
  const headers = apiConfig.headers(config)
  const body = apiConfig.body(text, voice, config)

  // Debug logging
  console.log("TTS Request:", { url, method: "POST", headers, body })

  const response = await fetch(url, {
    method: "POST",
    headers,
    body,
    // Add CORS mode explicitly
    mode: "cors",
    credentials: "omit",
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error")
    throw new Error(
      `${config.provider} TTS API error: ${response.status} ${response.statusText} - ${errorText}`
    )
  }

  const audioData = await apiConfig.processResponse(response)

  if (config.cacheAudio !== false) {
    cache.set(cacheKey, audioData)
  }

  return audioData
}

// Create AudioContext helper
const createAudioContext = (): AudioContext => {
  const AudioContextClass =
    window.AudioContext || (window as any).webkitAudioContext
  return new AudioContextClass()
}

// Main hook
export function useAudioTTS(options: UseAudioTTSOptions): UseAudioTTSReturn {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options }

  // State
  const [speaking, setSpeaking] = useState(false)
  const [paused, setPaused] = useState(false)
  const [loading, setLoading] = useState(false)
  const [supported, setSupported] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [voices, setVoices] = useState<ReadonlyArray<VoiceConfig>>([])
  const [selectedVoice, setSelectedVoice] = useState<VoiceConfig | null>(null)

  // Refs
  const audioContextRef = useRef<AudioContext | null>(null)
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const startTimeRef = useRef<number>(0)
  const pauseTimeRef = useRef<number>(0)
  const cacheRef = useRef(new Map<string, ArrayBuffer>())
  const optionsRef = useRef(mergedOptions)

  // Update options ref
  useEffect(() => {
    optionsRef.current = mergedOptions
  }, [mergedOptions])

  // Initialize
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
    const availableVoices = BUILTIN_VOICES[options.service.provider]
    setVoices(availableVoices)

    if (availableVoices.length > 0 && !selectedVoice) {
      const defaultVoice =
        availableVoices.find((v) => v.provider === "openai") ??
        availableVoices[0]
      setSelectedVoice(defaultVoice)
    }

    return () => {
      if (
        audioContextRef.current &&
        audioContextRef.current.state !== "closed"
      ) {
        audioContextRef.current.close()
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [options.service.provider, selectedVoice])

  // Time tracking
  const updateTime = useCallback(() => {
    if (audioContextRef.current && speaking && !paused) {
      const elapsed = audioContextRef.current.currentTime - startTimeRef.current
      setCurrentTime(elapsed)
      optionsRef.current.onProgress?.(elapsed, duration)

      if (elapsed < duration) {
        animationFrameRef.current = requestAnimationFrame(updateTime)
      } else {
        setSpeaking(false)
        setPaused(false)
        setCurrentTime(0)
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current)
        }
        optionsRef.current.onEnd?.()
      }
    }
  }, [speaking, paused, duration])

  // Cleanup audio nodes
  const cleanupNodes = useCallback(() => {
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop()
        sourceNodeRef.current.disconnect()
      } catch (error) {
        // Node may already be stopped/disconnected
      }
      sourceNodeRef.current = null
    }
  }, [])

  // Speak function
  const speak = useCallback(
    async (text: string): Promise<void> => {
      if (
        !supported ||
        !text.trim() ||
        !selectedVoice ||
        !audioContextRef.current
      ) {
        console.warn("TTS speak aborted: conditions not met.", {
          supported,
          textTrimmed: text.trim().length > 0,
          selectedVoice: !!selectedVoice,
          audioContext: !!audioContextRef.current,
        })
        return
      }

      try {
        setLoading(true)
        cleanupNodes() // Resume AudioContext if suspended

        if (audioContextRef.current.state === "suspended") {
          console.log("AudioContext is suspended, attempting to resume...")
          await audioContextRef.current.resume()
          console.log(
            "AudioContext state after resume:",
            audioContextRef.current.state
          )
        } else {
          console.log(
            "AudioContext state is already:",
            audioContextRef.current.state
          )
        } // Get audio data

        console.log("Starting TTS synthesis...")
        const audioData = await synthesizeTTS(
          text,
          selectedVoice,
          optionsRef.current.service,
          cacheRef.current
        )

        console.log(
          "TTS synthesis complete, audioData size:",
          audioData.byteLength
        ) // Decode audio

        let audioBuffer: AudioBuffer
        try {
          console.log("Attempting to decode audio data...")
          audioBuffer = await audioContextRef.current.decodeAudioData(audioData)
          console.log("Audio decoded successfully:", {
            duration: audioBuffer.duration,
            channels: audioBuffer.numberOfChannels,
            sampleRate: audioBuffer.sampleRate,
          })
        } catch (decodeError) {
          console.error("Audio decode error:", decodeError) // Removed "(likely CORS)" as we ruled that out
          throw new Error(
            `Audio decoding failed: ${decodeError}.` // Updated message
          )
        } // Create and connect nodes

        const sourceNode = audioContextRef.current.createBufferSource()
        const gainNode = audioContextRef.current.createGain()

        sourceNode.buffer = audioBuffer // This is the core connection
        gainNode.gain.value = optionsRef.current.volume
        console.log("Gain node volume set to:", gainNode.gain.value)

        sourceNode.connect(gainNode)
        gainNode.connect(audioContextRef.current.destination)
        console.log("Audio nodes connected to destination.") // Store references

        sourceNodeRef.current = sourceNode
        gainNodeRef.current = gainNode // Set duration and start playback

        setDuration(audioBuffer.duration)
        setCurrentTime(0)
        setSpeaking(true)
        setPaused(false)
        setLoading(false)

        startTimeRef.current = audioContextRef.current.currentTime // Add ended event listener

        sourceNode.onended = () => {
          console.log(
            "Audio playback ended (onended event fired). Context time:",
            audioContextRef.current?.currentTime
          )
          setSpeaking(false)
          setPaused(false)
          setCurrentTime(0)
          optionsRef.current.onEnd?.()
        }

        console.log("Calling sourceNode.start(0)...")
        sourceNode.start(0)
        console.log("Audio playback initiated.") // This means start() was called

        optionsRef.current.onStart?.()
        updateTime()
      } catch (error) {
        console.error("TTS Error:", error)
        setLoading(false)
        setSpeaking(false)
        const errorObj =
          error instanceof Error ? error : new Error("TTS synthesis failed")
        optionsRef.current.onError?.(errorObj)
        throw errorObj
      }
    },
    [supported, selectedVoice, cleanupNodes, updateTime]
  )

  // Control functions
  const stop = useCallback((): void => {
    cleanupNodes()
    setSpeaking(false)
    setPaused(false)
    setCurrentTime(0)
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }
    optionsRef.current.onEnd?.()
  }, [cleanupNodes])

  const pause = useCallback((): void => {
    if (!speaking || paused || !audioContextRef.current) return

    if (audioContextRef.current.state === "running") {
      audioContextRef.current.suspend()
      setPaused(true)
      pauseTimeRef.current = audioContextRef.current.currentTime
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
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
