/**
 * @module adapters/http
 *
 * Speech via an HTTP TTS backend: fetch the audio, then play it through the
 * Web Audio player.
 *
 * Its default configuration is the `openai-edge-tts` container from
 * `infra/compose/tts.yml` - an OpenAI-compatible `/v1/audio/speech` on
 * localhost:5050 - which is what `vite dev` and the Docker image get. The
 * other providers in `tts-client` are reachable by configuration; none of
 * that is visible to a caller, who only ever holds a `SpeechAdapter`.
 */

import type { AudioPlayer, AudioPlayerOptions } from "@speech/lib/engine"
import { createAudioPlayer } from "@speech/lib/engine"
import type { FetchImpl, TTSClient } from "@speech/lib/engine/tts-client"
import { createTTSClient } from "@speech/lib/engine/tts-client"
import { createSpeechLedger } from "@speech/lib/promise"
import {
  createAbortError,
  isAbortError,
  toError,
} from "@speech/lib/promise/abort"
import type { TTSServiceConfig, VoiceConfig } from "@speech/lib/types/tts-types"
import { BUILTIN_VOICES } from "@speech/lib/types/tts-types"

import type { SpeakOptions, SpeechAdapter } from "../types"

export type HttpSpeechAdapterOptions = {
  service: TTSServiceConfig
  /** Used when a `speak()` call names no voice of its own. */
  defaultVoice?: VoiceConfig | null
  fetchImpl?: FetchImpl
  player?: AudioPlayer
  playerOptions?: AudioPlayerOptions
  client?: TTSClient
}

function pickDefaultVoice(
  service: TTSServiceConfig,
  explicit: VoiceConfig | null | undefined
): VoiceConfig | null {
  if (explicit) return explicit
  return BUILTIN_VOICES[service.provider].at(0) ?? null
}

export function createHttpSpeechAdapter(
  options: HttpSpeechAdapterOptions
): SpeechAdapter {
  const { service } = options
  const player =
    options.player ?? createAudioPlayer(options.playerOptions ?? {})
  const client =
    options.client ?? createTTSClient({ service, fetchImpl: options.fetchImpl })
  const voices = BUILTIN_VOICES[service.provider]
  const defaultVoice = pickDefaultVoice(service, options.defaultVoice)

  // Covers the window the player cannot: between `speak()` being called and
  // the audio bytes arriving there is no `play()` promise yet, so a `stop()`
  // in that window has nothing in the player to flush. This ledger holds the
  // caller's promise for the whole span instead.
  const ledger = createSpeechLedger()
  let disposed = false

  const speak = (
    text: string,
    speakOptions: SpeakOptions = {}
  ): Promise<void> => {
    if (disposed) {
      return Promise.reject(createAbortError("Speech adapter was disposed"))
    }

    const entry = ledger.open()
    const controller = new AbortController()
    const abortLocal = (): void => controller.abort()
    speakOptions.signal?.addEventListener("abort", abortLocal, { once: true })
    // Rejecting the caller's entry (via `stop`, `dispose` or the signal)
    // must also stop the work still running underneath it.
    void entry.promise.catch(() => controller.abort())

    const run = async (): Promise<void> => {
      const voice = speakOptions.voice ?? defaultVoice
      if (!voice) throw new Error("No voice available for this TTS service")

      const audio = await client.synthesize(text, voice, {
        signal: controller.signal,
      })
      if (entry.isSettled()) return

      await player.play(audio, {
        signal: controller.signal,
        volume: speakOptions.volume,
        playbackRate: speakOptions.playbackRate,
        onStart: speakOptions.onStart,
        onEnd: speakOptions.onEnd,
        onProgress: speakOptions.onProgress,
      })
      entry.resolve()
    }

    void run()
      .catch((error: unknown) => {
        const failure = toError(error)
        // A cancellation is not something a consumer's error handler should
        // see - it is the consumer that asked for it.
        if (!isAbortError(failure)) speakOptions.onError?.(failure)
        entry.reject(failure)
      })
      .finally(() => {
        speakOptions.signal?.removeEventListener("abort", abortLocal)
      })

    return entry.promise
  }

  return {
    id: "http",
    supported: player.supported,
    voices,
    get pending(): number {
      return ledger.size + player.pending
    },
    speak,
    stop: (): void => {
      ledger.flush(createAbortError("Speech stopped"))
      player.stop()
    },
    pause: (): void => player.pause(),
    resume: (): void => player.resume(),
    setVolume: (volume: number): void => player.setVolume(volume),
    setPlaybackRate: (rate: number): void => player.setPlaybackRate(rate),
    dispose: (): void => {
      if (disposed) return
      disposed = true
      ledger.flush(createAbortError("Speech adapter was disposed"))
      // A caller-supplied player is the caller's to dispose.
      if (options.player) player.stop()
      else player.dispose()
      client.clearCache()
    },
  }
}
