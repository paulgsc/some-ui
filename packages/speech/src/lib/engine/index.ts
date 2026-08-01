export type {
  AudioContextFactory,
  AudioPlayer,
  AudioPlayerOptions,
  AudioPlayerState,
  PlayOptions,
} from "./audio-player"
export { createAudioPlayer } from "./audio-player"
export type {
  FetchImpl,
  SynthesizeOptions,
  TTSClient,
  TTSClientOptions,
} from "./tts-client"
export {
  createCacheKey,
  createTTSClient,
  DEFAULT_OPENAI_EDGE_ENDPOINT,
  DEFAULT_TTS_TIMEOUT_MS,
} from "./tts-client"
