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

import type { SpeakOptions, SpeechAdapter } from "@speech/lib/adapters/types"
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

export type HttpSpeechAdapterOptions = {
  service: TTSServiceConfig
  /**
   * The voice for a line in `lang` (`hostedVoiceFor` over the person's
   * choice, from the registry). `null` means this service has no voice for
   * that language, and the line fails rather than going to one that cannot
   * read it.
   */
  voiceFor: (lang: string | undefined) => VoiceConfig | null
  fetchImpl?: FetchImpl
  player?: AudioPlayer
  playerOptions?: AudioPlayerOptions
  client?: TTSClient
}

export function createHttpSpeechAdapter(
  options: HttpSpeechAdapterOptions
): SpeechAdapter {
  const { service } = options
  const player =
    options.player ?? createAudioPlayer(options.playerOptions ?? {})
  const client =
    options.client ?? createTTSClient({ service, fetchImpl: options.fetchImpl })

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
      const voice = options.voiceFor(speakOptions.lang)
      if (!voice) {
        throw new Error(
          `${service.provider} has no voice for ${speakOptions.lang ?? "the default language"}`
        )
      }

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
