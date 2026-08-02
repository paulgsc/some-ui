// Temporary re-export shim (UTL-HOIST S4, #533) - the TTS and audio-storage
// types moved to @some-ui/speech with the code that owns them. Removed in
// UTL-CUTOVER once every consumer imports them from there directly.
export type {
  AudioFormat,
  AudioStorageOptions,
  AudioStorageService,
  CachedAudio,
  TTSAPIConfig,
  TTSOptions,
  TTSProvider,
  TTSServiceConfig,
  UseAudioStorageOptions,
  UseAudioStorageReturn,
  UseAudioTTSOptions,
  VoiceConfig,
} from "@some-ui/speech"
export { BUILTIN_VOICES } from "@some-ui/speech"
