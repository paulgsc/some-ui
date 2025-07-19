import { useCallback, useEffect, useRef, useState } from "react"

// TTS Service providers
type TTSProvider = "elevenlabs" | "openai" | "google" | "azure" | "custom"

// Voice configuration for different providers
type VoiceConfig = {
  id: string
  name: string
  provider: TTSProvider
  language?: string
  gender?: "male" | "female" | "neutral"
  style?: string
}

// Audio format options
type AudioFormat = "mp3" | "ogg" | "wav" | "aac" | "flac" | "pcm" // Added more formats

// Generic constraint for TTS options
type TTSOptions = {
  volume?: number
  playbackRate?: number
  crossOrigin?: "anonymous" | "use-credentials"
}

// TTS service configuration
type TTSServiceConfig = {
  provider: TTSProvider
  apiKey?: string // For our local server, this can be a dummy key or not used if REQUIRE_API_KEY is False
  apiUrl?: string // This will be our local server URL
  format?: AudioFormat
  sampleRate?: number
  quality?: "low" | "medium" | "high"
  cacheAudio?: boolean
}

// Hook options extending base TTS options
type UseAudioTTSOptions<T extends TTSOptions = TTSOptions> = {
  service: TTSServiceConfig
  autoPlay?: boolean
  preloadVoices?: boolean
  cacheAudio?: boolean
  onStart?: () => void
  onEnd?: () => void
  onError?: (error: Error) => void
  onProgress?: (currentTime: number, duration: number) => void
} & T

// Return interface with proper constraints
type UseAudioTTSReturn<T extends TTSOptions = TTSOptions> = {
  speak: (text: string) => Promise<void>
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
  voices: ReadonlyArray<VoiceConfig>
  selectedVoice: VoiceConfig | null
  setSelectedVoice: (voice: VoiceConfig | null) => void
  updateOptions: (newOptions: Partial<T>) => void
  audioContext: AudioContext | null
}

// Default options
const DEFAULT_OPTIONS = {
  volume: 1,
  playbackRate: 1,
  crossOrigin: "anonymous" as const,
  autoPlay: true,
  preloadVoices: true,
  cacheAudio: true,
} as const

// Built-in voice configurations for different providers
// Note: For 'openai', these are the OpenAI standard voices,
// travisvn/openai-edge-tts maps these to Edge TTS voices.
const BUILTIN_VOICES: Record<TTSProvider, Array<VoiceConfig>> = {
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
    // You can also add specific Edge TTS voices here if you want to use them directly
    // { id: 'en-US-AvaNeural', name: 'Ava (Edge)', provider: 'openai', language: 'en-US', gender: 'female' },
    // { id: 'en-US-GuyNeural', name: 'Guy (Edge)', provider: 'openai', language: 'en-US', gender: 'male' },
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
}

// Type guard for AudioContext support
const isAudioContextSupported = (): boolean =>
  typeof window !== "undefined" &&
  (window.AudioContext !== undefined ||
    (window as any).webkitAudioContext !== undefined)

// TTS Service implementations
class TTSService {
  private cache = new Map<string, ArrayBuffer>()
  constructor(
    private config: TTSServiceConfig,
    private onProgress?: (loaded: number, total: number) => void
  ) {}

  async synthesize(text: string, voice: VoiceConfig): Promise<ArrayBuffer> {
    const cacheKey = `${voice.id}-${text.slice(0, 100)}` // Use first 100 chars as cache key

    if (this.config.cacheAudio !== false && this.cache.has(cacheKey)) {
      // Check cacheAudio option
      return this.cache.get(cacheKey)!
    }
    let audioData: ArrayBuffer
    switch (this.config.provider) {
      case "elevenlabs":
        audioData = await this.synthesizeElevenLabs(text, voice)
        break
      case "openai":
        audioData = await this.synthesizeOpenAI(text, voice)
        break
      case "google":
        audioData = await this.synthesizeGoogle(text, voice)
        break
      case "azure":
        audioData = await this.synthesizeAzure(text, voice)
        break
      case "custom":
        audioData = await this.synthesizeCustom(text, voice)
        break
      default:
        throw new Error(`Unsupported TTS provider: ${this.config.provider}`)
    }
    if (this.config.cacheAudio !== false) {
      this.cache.set(cacheKey, audioData)
    }
    return audioData
  }

  private async synthesizeElevenLabs(
    text: string,
    voice: VoiceConfig
  ): Promise<ArrayBuffer> {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice.id}`,
      {
        method: "POST",
        headers: {
          Accept: "audio/mpeg",
          "Content-Type": "application/json",
          "xi-api-key": this.config.apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_monolingual_v1",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.5,
          },
        }),
      }
    )
    if (!response.ok) {
      throw new Error(`ElevenLabs API error: ${response.statusText}`)
    }
    return response.arrayBuffer()
  }

  private async synthesizeOpenAI(
    text: string,
    voice: VoiceConfig
  ): Promise<ArrayBuffer> {
    // Crucial change: Use the apiUrl provided in the service config
    // The travisvn/openai-edge-tts container exposes an OpenAI-compatible endpoint
    const apiUrl = this.config.apiUrl || "http://localhost:5050/v1/audio/speech" // Default to our local server

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey || "your_dummy_api_key_here"}`, // Use the provided API key or dummy
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1", // travisvn/openai-edge-tts supports this model
        input: text,
        voice: voice.id, // Use the selected OpenAI-compatible voice ID
        response_format: this.config.format || "mp3",
        speed: 1.0, // Speed can be adjusted via the hook's setPlaybackRate
      }),
    })
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(
        `OpenAI (Edge TTS) API error: ${response.status} ${response.statusText} - ${errorText}`
      )
    }
    return response.arrayBuffer()
  }

  private async synthesizeGoogle(
    text: string,
    voice: VoiceConfig
  ): Promise<ArrayBuffer> {
    const response = await fetch(
      `${this.config.apiUrl || "https://texttospeech.googleapis.com/v1/text:synthesize"}?key=${this.config.apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: { text },
          voice: {
            languageCode: voice.language || "en-US",
            name: voice.id,
          },
          audioConfig: {
            audioEncoding: this.config.format.toUpperCase() || "MP3",
            sampleRateHertz: this.config.sampleRate || 24000,
          },
        }),
      }
    )
    if (!response.ok) {
      throw new Error(`Google TTS API error: ${response.statusText}`)
    }
    const data = await response.json()
    return Uint8Array.from(atob(data.audioContent), (c) => c.charCodeAt(0))
      .buffer
  }

  private async synthesizeAzure(
    text: string,
    voice: VoiceConfig
  ): Promise<ArrayBuffer> {
    const ssml = `<speak version="1.0" xmlns="https://www.w3.org/2001/10/synthesis" xml:lang="${voice.language || "en-US"}">
      <voice name="${voice.id}">${text}</voice>
    </speak>`
    const response = await fetch(this.config.apiUrl, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": this.config.apiKey,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-16khz-128kbitrate-mono-mp3",
      },
      body: ssml,
    })
    if (!response.ok) {
      throw new Error(`Azure TTS API error: ${response.statusText}`)
    }
    return response.arrayBuffer()
  }

  private async synthesizeCustom(
    text: string,
    voice: VoiceConfig
  ): Promise<ArrayBuffer> {
    const response = await fetch(this.config.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.config.apiKey && {
          Authorization: `Bearer ${this.config.apiKey}`,
        }),
      },
      body: JSON.stringify({ text, voice: voice.id }),
    })
    if (!response.ok) {
      throw new Error(`Custom TTS API error: ${response.statusText}`)
    }
    return response.arrayBuffer()
  }
}

export function useAudioTTS<T extends TTSOptions = TTSOptions>(
  initialOptions: UseAudioTTSOptions<T>
): UseAudioTTSReturn<T> {
  // Merge options with defaults
  const options = { ...DEFAULT_OPTIONS, ...initialOptions }
  // State management
  const [speaking, setSpeaking] = useState(false)
  const [paused, setPaused] = useState(false)
  const [loading, setLoading] = useState(false)
  const [supported, setSupported] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [voices, setVoices] = useState<ReadonlyArray<VoiceConfig>>([])
  const [selectedVoice, setSelectedVoice] = useState<VoiceConfig | null>(null)
  const [currentOptions, setCurrentOptions] = useState<T>(initialOptions as T)
  // Audio references
  const audioContextRef = useRef<AudioContext | null>(null)
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)
  const audioBufferRef = useRef<AudioBuffer | null>(null)
  const ttsServiceRef = useRef<TTSService | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const startTimeRef = useRef<number>(0)
  const pauseTimeRef = useRef<number>(0)
  const optionsRef = useRef(options)

  // Update options ref when they change
  useEffect(() => {
    optionsRef.current = { ...optionsRef.current, ...currentOptions }
  }, [currentOptions])

  // Initialize AudioContext and TTS service
  useEffect(() => {
    const { service, cacheAudio } = optionsRef.current

    if (!isAudioContextSupported()) {
      setSupported(false)
      return
    }
    setSupported(true)
    // Initialize AudioContext
    const AudioContextClass =
      window.AudioContext || (window as any).webkitAudioContext
    if (
      !audioContextRef.current ||
      audioContextRef.current.state === "closed"
    ) {
      audioContextRef.current = new AudioContextClass()
    }

    // Initialize TTS service
    // Pass the cacheAudio option to the TTSService constructor
    ttsServiceRef.current = new TTSService(
      { ...service, cacheAudio },
      optionsRef.current.onProgress
    )

    // Load voices
    const availableVoices = BUILTIN_VOICES[service.provider]
    setVoices(availableVoices)
    if (availableVoices.length > 0 && !selectedVoice) {
      // Set a default voice from the available OpenAI voices if not already selected
      setSelectedVoice(
        availableVoices.find((v) => v.provider === "openai") ??
          availableVoices[0]
      )
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
  }, [
    optionsRef.current.service,
    selectedVoice,
    optionsRef.current.onProgress,
    optionsRef.current.cacheAudio,
  ]) // Add service.apiUrl and cacheAudio to dependencies

  // Time tracking
  const updateTime = useCallback(() => {
    if (audioContextRef.current && speaking && !paused) {
      const elapsed = audioContextRef.current.currentTime - startTimeRef.current
      setCurrentTime(elapsed)
      optionsRef.current.onProgress?.(elapsed, duration)

      if (elapsed < duration) {
        animationFrameRef.current = requestAnimationFrame(updateTime)
      } else {
        // Audio finished playing
        setSpeaking(false)
        setPaused(false)
        setCurrentTime(0)
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current)
        }
        optionsRef.current.onEnd?.()
      }
    }
  }, [
    speaking,
    paused,
    duration,
    optionsRef.current.onProgress,
    optionsRef.current.onEnd,
  ]) // Add onEnd to dependencies

  // Enhanced speak function
  const speak = useCallback(
    async (text: string): Promise<void> => {
      if (
        !supported ||
        !text.trim() ||
        !selectedVoice ||
        !ttsServiceRef.current ||
        !audioContextRef.current
      ) {
        console.warn("TTS not ready or unsupported. Check prerequisites:", {
          supported,
          textTrimmed: text.trim().length > 0,
          selectedVoice,
          ttsServiceRef: !!ttsServiceRef.current,
          audioContext: !!audioContextRef.current,
        })
        return Promise.resolve()
      }
      try {
        setLoading(true)

        // Stop any ongoing playback
        if (sourceNodeRef.current) {
          sourceNodeRef.current.stop()
          sourceNodeRef.current.disconnect()
          sourceNodeRef.current = null // Clear the reference
        }
        // Resume AudioContext if suspended
        if (audioContextRef.current.state === "suspended") {
          await audioContextRef.current.resume()
        }

        // Get audio data from TTS service
        const audioData = await ttsServiceRef.current.synthesize(
          text,
          selectedVoice
        )

        // Decode audio data
        const audioBuffer =
          await audioContextRef.current.decodeAudioData(audioData)
        audioBufferRef.current = audioBuffer
        // Create audio nodes
        const sourceNode = audioContextRef.current.createBufferSource()
        const gainNode = audioContextRef.current.createGain()
        sourceNode.buffer = audioBuffer
        gainNode.gain.value = optionsRef.current.volume
        // Connect nodes
        sourceNode.connect(gainNode)
        gainNode.connect(audioContextRef.current.destination)
        // Store references
        sourceNodeRef.current = sourceNode
        gainNodeRef.current = gainNode
        // Set up event handlers
        sourceNode.onended = () => {
          // This onended will be called when the audio naturally finishes.
          // The updateTime cleanup will also handle this.
          // No need to set speaking/paused here directly, updateTime will do it.
        }
        // Set duration and start playback
        setDuration(audioBuffer.duration)
        setCurrentTime(0)
        setSpeaking(true)
        setPaused(false)
        setLoading(false)
        startTimeRef.current = audioContextRef.current.currentTime
        sourceNode.start(0)

        optionsRef.current.onStart?.()
        updateTime()
      } catch (error) {
        setLoading(false)
        setSpeaking(false)
        optionsRef.current.onError?.(
          error instanceof Error ? error : new Error("TTS synthesis failed")
        )
        console.error("TTS Speak Error:", error)
        throw error
      }
    },
    [
      supported,
      selectedVoice,
      optionsRef.current.volume,
      optionsRef.current.onStart,
      optionsRef.current.onEnd,
      optionsRef.current.onError,
      updateTime,
      optionsRef.current.service.apiUrl,
      optionsRef.current.service.apiKey,
      optionsRef.current.service.format,
    ] // Added relevant service options to dependencies
  )

  // Control functions (remain mostly the same)
  const stop = useCallback((): void => {
    if (sourceNodeRef.current) {
      sourceNodeRef.current.stop()
      sourceNodeRef.current.disconnect()
      sourceNodeRef.current = null
    }
    setSpeaking(false)
    setPaused(false)
    setCurrentTime(0)
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }
    // Also explicitly call onEnd here if stopping prematurely
    optionsRef.current.onEnd?.()
  }, [optionsRef.current.onEnd])

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

  // Dynamic options update
  const updateOptions = useCallback((newOptions: Partial<T>): void => {
    setCurrentOptions((prev) => ({ ...prev, ...newOptions }))
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
    updateOptions,
    audioContext: audioContextRef.current,
  } as UseAudioTTSReturn<T>
}
