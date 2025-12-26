// TTS Service providers
export type TTSProvider =
  | "elevenlabs"
  | "openai"
  | "google"
  | "azure"
  | "custom"

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
export type AudioFormat = "mp3" | "ogg" | "wav" | "aac" | "flac" | "pcm"

// TTS service configuration
export type TTSServiceConfig = {
  readonly provider: TTSProvider
  readonly apiKey?: string
  readonly apiUrl?: string
  readonly format?: AudioFormat
  readonly sampleRate?: number
  readonly quality?: "low" | "medium" | "high"
  readonly cacheAudio?: boolean
  readonly timeout?: number // Timeout in milliseconds
}

// TTS synthesis function configuration
export type TTSAPIConfig = {
  readonly url: (config: TTSServiceConfig, voice: VoiceConfig) => string
  readonly headers: (config: TTSServiceConfig) => Record<string, string>
  readonly body: (
    text: string,
    voice: VoiceConfig,
    config: TTSServiceConfig
  ) => string
  readonly processResponse: (response: Response) => Promise<ArrayBuffer>
}

// Hook options
export type TTSOptions = {
  readonly volume?: number
  readonly playbackRate?: number
  readonly autoPlay?: boolean
  readonly voice?: VoiceConfig
  readonly onStart?: () => void
  readonly onEnd?: () => void
  readonly onError?: (error: Error) => void
  readonly onProgress?: (currentTime: number, duration: number) => void
}

export type UseAudioTTSOptions = TTSOptions & {
  readonly service: TTSServiceConfig
}

// Hook return interface
export type UseAudioTTSReturn = {
  readonly speak: (text: string) => Promise<void>
  readonly stop: () => void
  readonly pause: () => void
  readonly resume: () => void
  readonly setVolume: (volume: number) => void
  readonly setPlaybackRate: (rate: number) => void
  readonly updateOptions: (newOptions: Partial<UseAudioTTSOptions>) => void
  readonly speaking: boolean
  readonly paused: boolean
  readonly loading: boolean
  readonly supported: boolean
  readonly currentTime: number
  readonly duration: number
  readonly voices: ReadonlyArray<VoiceConfig>
  readonly selectedVoice: VoiceConfig | null
  readonly setSelectedVoice: (voice: VoiceConfig | null) => void
}

// Built-in voice configurations
export const BUILTIN_VOICES: Record<TTSProvider, ReadonlyArray<VoiceConfig>> = {
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
      id: "alloy",
      name: "Alloy",
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
      id: "ko-KR-SunHiNeural",
      name: "Sun-Hi (Korean Female)",
      provider: "openai",
      language: "ko-KR",
      gender: "female",
    },
    {
      id: "ko-KR-InJoonNeural",
      name: "In-Joon (Korean Male)",
      provider: "openai",
      language: "ko-KR",
      gender: "male",
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
