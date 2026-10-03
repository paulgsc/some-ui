/**
 * A hand-driven `NativeSpeechEngine`, for the native adapter's tests.
 *
 * It behaves the way the Capacitor plugin does where that matters to the
 * settlement laws: `speak()` replaces the utterance in flight, and the
 * replaced or stopped utterance's promise never settles. Nothing finishes
 * on its own; a test says when the utterance in flight ends or fails.
 */

import type {
  NativeSpeechEngine,
  NativeSpeechRequest,
  NativeVoice,
} from "@speech/lib/adapters/native"

export type FakeNativeEngineOptions = {
  voices?: ReadonlyArray<NativeVoice>
  /** Languages with voice data installed. Omitted means every language. */
  installed?: ReadonlyArray<string>
}

export type FakeNativeEngineHandle = {
  engine: NativeSpeechEngine
  readonly spoken: ReadonlyArray<NativeSpeechRequest>
  readonly stopCount: number
  /** Installs voice data for `lang`, as the system settings would. */
  install: (lang: string) => void
  /** Finishes the utterance in flight. */
  end: () => void
  /** Fails the utterance in flight. */
  fail: (message?: string) => void
}

type InFlight = {
  resolve: () => void
  reject: (error: Error) => void
}

export function createFakeNativeEngine(
  options: FakeNativeEngineOptions = {}
): FakeNativeEngineHandle {
  const spoken: Array<NativeSpeechRequest> = []
  const installed =
    options.installed === undefined ? null : new Set(options.installed)
  let current: InFlight | null = null
  let stopCount = 0

  const engine: NativeSpeechEngine = {
    speak: (request) => {
      spoken.push(request)
      // The plugin stops what was speaking and forgets its callback.
      current = null
      return new Promise<void>((resolve, reject) => {
        current = { resolve, reject }
      })
    },
    stop: () => {
      stopCount += 1
      current = null
      return Promise.resolve()
    },
    getVoices: () => Promise.resolve(options.voices ?? []),
    isLanguageSupported: (lang) =>
      Promise.resolve(installed === null || installed.has(lang)),
  }

  return {
    engine,
    get spoken(): ReadonlyArray<NativeSpeechRequest> {
      return spoken
    },
    get stopCount(): number {
      return stopCount
    },
    install: (lang): void => {
      installed?.add(lang)
    },
    end: (): void => {
      const finished = current
      current = null
      finished?.resolve()
    },
    fail: (message = "Error while performing speak."): void => {
      const failed = current
      current = null
      failed?.reject(new Error(message))
    },
  }
}
