import type { DeviceVoiceChoice } from "@speech/lib/adapters/types"
import type { SpokenLanguage } from "@speech/lib/language"

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
  /** The language the voice reads; every catalogue voice reads one of ours. */
  readonly language: SpokenLanguage
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
  /** The text's language; the session picks the voice for it. */
  readonly language?: SpokenLanguage
  /**
   * A device voice for this one line. Only the session's voice preview
   * sets it (`SpeechQueueManager.preview`).
   */
  readonly voice?: DeviceVoiceChoice
  readonly onStart?: () => void
  readonly onEnd?: () => void
  readonly onError?: (error: Error) => void
  readonly onProgress?: (currentTime: number, duration: number) => void
  /** Word-boundary progress, where the backend reports it. */
  readonly onBoundary?: (charIndex: number, charLength: number) => void
}

export type UseAudioTTSOptions = TTSOptions & {
  readonly service: TTSServiceConfig
}

/**
 * Every voice a hosted backend offers, per provider. The ids are kept as
 * literals (`satisfies`, not an annotation), so `HostedVoiceOf<P>` in
 * `lib/voices` is a closed union a typo cannot pass.
 */
export const BUILTIN_VOICES = {
  elevenlabs: [
    {
      id: "rachel",
      name: "Rachel",
      provider: "elevenlabs",
      language: "english",
      gender: "female",
    },
    {
      id: "drew",
      name: "Drew",
      provider: "elevenlabs",
      language: "english",
      gender: "male",
    },
    {
      id: "clyde",
      name: "Clyde",
      provider: "elevenlabs",
      language: "english",
      gender: "male",
    },
  ],
  openai: [
    {
      id: "onyx",
      name: "Onyx",
      provider: "openai",
      language: "english",
      gender: "male",
    },
    {
      id: "alloy",
      name: "Alloy",
      provider: "openai",
      language: "english",
      gender: "neutral",
    },
    {
      id: "nova",
      name: "Nova",
      provider: "openai",
      language: "english",
      gender: "female",
    },
    {
      id: "ko-KR-SunHiNeural",
      name: "Sun-Hi (Korean Female)",
      provider: "openai",
      language: "korean",
      gender: "female",
    },
    {
      id: "ko-KR-InJoonNeural",
      name: "In-Joon (Korean Male)",
      provider: "openai",
      language: "korean",
      gender: "male",
    },
  ],
  google: [
    {
      id: "en-US-Wavenet-D",
      name: "Google Male",
      provider: "google",
      language: "english",
      gender: "male",
    },
    {
      id: "en-US-Wavenet-F",
      name: "Google Female",
      provider: "google",
      language: "english",
      gender: "female",
    },
  ],
  azure: [
    {
      id: "en-US-JennyNeural",
      name: "Jenny",
      provider: "azure",
      language: "english",
      gender: "female",
    },
    {
      id: "en-US-GuyNeural",
      name: "Guy",
      provider: "azure",
      language: "english",
      gender: "male",
    },
  ],
  custom: [],
} as const satisfies Record<TTSProvider, ReadonlyArray<VoiceConfig>>
