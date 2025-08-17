// Audio Storage Types
import type { TTSProvider, VoiceConfig } from "./tts-types"

export type AudioStorageService = {
  provider: TTSProvider
  storageEndpoint: string
  pathGenerator?: (text: string, voice: VoiceConfig) => string
  headers?: Record<string, string>
  retryConfig?: {
    maxRetries: number
    delay: number
  }
}

export type AudioStorageOptions = {
  volume?: number
  playbackRate?: number
  autoPlay?: boolean
  onError?: (error: Error) => void
  onStart?: () => void
  onEnd?: () => void
  onPause?: () => void
  readonly onProgress?: (currentTime: number, duration: number) => void
  onResume?: () => void
  // TanStack Query specific options
  staleTime?: number
  cacheTime?: number
}

export type UseAudioStorageOptions = {
  service: AudioStorageService
} & AudioStorageOptions

export type UseAudioStorageReturn = {
  speak: (text: string) => Promise<void>
  stop: () => void
  pause: () => void
  resume: () => void
  setVolume: (volume: number) => void
  setPlaybackRate: (rate: number) => void
  updateOptions: (options: AudioStorageOptions) => void
  searchAudio: (searchQuery: string) => Promise<Array<string>>

  // State
  speaking: boolean
  paused: boolean
  loading: boolean
  supported: boolean
  currentTime: number
  duration: number
  currentAudioId: string | null

  // Voice management
  voices: Array<VoiceConfig>
  selectedVoice: VoiceConfig | null
  setSelectedVoice: (voice: VoiceConfig | null) => void

  // Storage-specific
  error: unknown
  refetch: () => Promise<unknown>
}
