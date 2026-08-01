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

export type UseAudioStorageReturn<T> = {
  speak: (text: string) => Promise<void>
  stop: () => void
  pause: () => void
  resume: () => void
  setVolume: (volume: number) => void
  setPlaybackRate: (rate: number) => void
  updateOptions: (options: AudioStorageOptions) => void
  searchAudio: (limit?: number, page?: number) => Promise<T>
  getAudioById: (
    id: string,
    forceRefresh?: boolean
  ) => Promise<CachedAudio | null>

  // State
  speaking: boolean
  paused: boolean
  loading: boolean
  supported: boolean
  currentTime: number
  duration: number
  currentAudioId: string | null
  currentAudioData?: CachedAudio
  searchResults?: T

  // Voice management
  voices: Array<VoiceConfig>
  selectedVoice: VoiceConfig | null
  setSelectedVoice: (voice: VoiceConfig | null) => void

  // Storage-specific
  error: unknown
  refetch: () => Promise<unknown>
}

/**
 * Mirrors the `cachedAudioSchema` that `use-audio-storage` validates
 * responses with. Declared as a type here rather than re-exporting the
 * schema: this module is the type surface, and a zod schema in it would
 * pull a runtime dependency into every consumer that only wants the shape.
 */
export type CachedAudio = {
  id: string
  /** base64-encoded audio data */
  data: string
  metadata?: {
    text?: string
    voice?: string
    created_at?: string
    file_size?: number
  }
}
