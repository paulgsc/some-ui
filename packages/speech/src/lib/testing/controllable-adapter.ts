/**
 * A `SpeechAdapter` whose utterances finish only when a test says so.
 *
 * It is built on the same `SpeechLedger` the real adapters use, so it obeys
 * the settlement laws in `adapters/types.ts` rather than merely pretending
 * to - which matters, because the queue tests use it to assert that *the
 * queue* behaves when its adapter behaves.
 */

import type { SpeakOptions, SpeechAdapter } from "@speech/lib/adapters/types"
import type { PendingSpeech } from "@speech/lib/promise"
import { createSpeechLedger } from "@speech/lib/promise"
import { createAbortError } from "@speech/lib/promise/abort"
import type { VoiceConfig } from "@speech/lib/types/tts-types"

export type AdapterCall = {
  readonly text: string
  readonly options: SpeakOptions
  readonly entry: PendingSpeech
}

export type ControllableAdapter = SpeechAdapter & {
  readonly calls: ReadonlyArray<AdapterCall>
  readonly stopCount: number
  readonly disposeCount: number
  /** Finishes the oldest still-unsettled call. */
  finish: () => void
  /** Fails the oldest still-unsettled call. */
  fail: (error?: Error) => void
}

export function createControllableAdapter(
  voices: ReadonlyArray<VoiceConfig> = []
): ControllableAdapter {
  const ledger = createSpeechLedger()
  const calls: Array<AdapterCall> = []
  let stopCount = 0
  let disposeCount = 0
  let disposed = false

  const oldestPending = (): AdapterCall | undefined =>
    calls.find((call) => !call.entry.isSettled())

  const speak = (text: string, options: SpeakOptions = {}): Promise<void> => {
    if (disposed) {
      return Promise.reject(createAbortError("Speech adapter was disposed"))
    }
    if (options.signal?.aborted) {
      return Promise.reject(createAbortError("Aborted before start"))
    }

    const entry = ledger.open()
    calls.push({ text, options, entry })

    options.signal?.addEventListener(
      "abort",
      () => entry.reject(createAbortError("Speech aborted")),
      { once: true }
    )
    options.onStart?.()

    return entry.promise
  }

  return {
    id: "web-speech",
    supported: true,
    voices,
    get pending(): number {
      return ledger.size
    },
    get calls(): ReadonlyArray<AdapterCall> {
      return calls
    },
    get stopCount(): number {
      return stopCount
    },
    get disposeCount(): number {
      return disposeCount
    },
    speak,
    stop: (): void => {
      stopCount += 1
      ledger.flush(createAbortError("Speech stopped"))
    },
    pause: (): void => undefined,
    resume: (): void => undefined,
    setVolume: (): void => undefined,
    setPlaybackRate: (): void => undefined,
    dispose: (): void => {
      disposeCount += 1
      disposed = true
      ledger.flush(createAbortError("Speech adapter was disposed"))
    },
    finish: (): void => {
      const call = oldestPending()
      call?.options.onEnd?.()
      call?.entry.resolve()
    },
    fail: (error = new Error("synthesis failed")): void => {
      const call = oldestPending()
      call?.options.onError?.(error)
      call?.entry.reject(error)
    },
  }
}
