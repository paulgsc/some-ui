/**
 * @module engine/audio-player
 *
 * Web Audio playback of already-fetched audio, as a plain object rather
 * than a hook.
 *
 * It used to be `useAudioSpeech`, and being a hook was the root of the
 * session-poisoning bug: the AudioContext, the source node and the
 * "previous speech" promise chain all lived in refs owned by whichever
 * component happened to mount first. When that component unmounted, the
 * refs went with it while the promises awaiting them did not, and the
 * global speech queue kept a live reference to the dead hook. A player with
 * an explicit `dispose()` has one owner and one teardown, and its lifetime
 * is a decision rather than an accident.
 *
 * Settlement contract (enforced by `audio-player.test.ts`):
 * - `play()` resolves when the buffer has finished playing.
 * - `play()` rejects with an `AbortError` if the caller's signal aborts, if
 *   `stop()` is called, or if the player is disposed - in every case
 *   *before* the call that caused it returns.
 * - `play()` rejects with the underlying error if decoding or playback
 *   fails.
 * - `pending` is 0 whenever the player is at rest, and always 0 after
 *   `stop()` or `dispose()`.
 */

import type { PendingSpeech } from "@speech/lib/promise"
import { createSpeechLedger } from "@speech/lib/promise"
import { createAbortError, toError } from "@speech/lib/promise/abort"

export type AudioContextFactory = () => AudioContext

export type AudioPlayerOptions = {
  /** Injected in tests; defaults to the platform `AudioContext`. */
  audioContextFactory?: AudioContextFactory
}

export type PlayOptions = {
  signal?: AbortSignal
  volume?: number
  playbackRate?: number
  onStart?: () => void
  onEnd?: () => void
  onProgress?: (currentTime: number, duration: number) => void
}

export type AudioPlayerState = {
  readonly speaking: boolean
  readonly paused: boolean
  readonly loading: boolean
  readonly currentTime: number
  readonly duration: number
}

export type AudioPlayer = {
  readonly supported: boolean
  /** Outstanding `play()` promises. Diagnostics and tests only. */
  readonly pending: number
  /** True once `dispose()` has run. A disposed player never speaks again. */
  readonly disposed: boolean
  readonly state: AudioPlayerState
  play: (audio: ArrayBuffer, options?: PlayOptions) => Promise<void>
  stop: () => void
  pause: () => void
  resume: () => void
  setVolume: (volume: number) => void
  setPlaybackRate: (rate: number) => void
  subscribe: (listener: () => void) => () => void
  dispose: () => void
}

const IDLE_STATE: AudioPlayerState = {
  speaking: false,
  paused: false,
  loading: false,
  currentTime: 0,
  duration: 0,
}

type AudioContextConstructor = new () => AudioContext

/**
 * Reads the constructor off `window` by name rather than through
 * `window.AudioContext`, whose type claims it is always present. It isn't:
 * Safari only exposes the `webkit`-prefixed one, and jsdom exposes neither.
 */
function findAudioContextConstructor(): AudioContextConstructor | undefined {
  if (typeof window === "undefined") return undefined
  for (const key of ["AudioContext", "webkitAudioContext"]) {
    const candidate = Reflect.get(window, key)
    if (typeof candidate === "function") {
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- a `typeof x === "function"` check is as far as the type system goes here; the value came off `window` under a name only an AudioContext constructor is published as
      return candidate as AudioContextConstructor
    }
  }
  return undefined
}

function defaultAudioContextFactory(): AudioContext {
  const Ctor = findAudioContextConstructor()
  if (!Ctor) throw new Error("AudioContext is not supported in this runtime")
  return new Ctor()
}

function isAudioContextAvailable(): boolean {
  return findAudioContextConstructor() !== undefined
}

export function createAudioPlayer(
  options: AudioPlayerOptions = {}
): AudioPlayer {
  const createContext = options.audioContextFactory
  const supported = createContext !== undefined || isAudioContextAvailable()

  const ledger = createSpeechLedger()
  const listeners = new Set<() => void>()

  let context: AudioContext | null = null
  let sourceNode: AudioBufferSourceNode | null = null
  let gainNode: GainNode | null = null
  let frameId: number | null = null
  let startedAt = 0
  let pausedAt = 0
  let disposed = false
  let state: AudioPlayerState = IDLE_STATE

  /**
   * Serializes overlapping `play()` calls. Derived from each entry's own
   * promise, so a flush settles the entry *and* unblocks the chain - the
   * previous implementation reassigned this to `Promise.resolve()` on stop
   * and stranded whatever was waiting on the old one.
   */
  let tail: Promise<void> = Promise.resolve()

  const emit = (): void => {
    for (const listener of listeners) listener()
  }

  const setState = (next: Partial<AudioPlayerState>): void => {
    state = { ...state, ...next }
    emit()
  }

  const getContext = (): AudioContext => {
    if (!context || context.state === "closed") {
      context = (createContext ?? defaultAudioContextFactory)()
    }
    return context
  }

  const cancelFrame = (): void => {
    if (frameId !== null) {
      cancelAnimationFrame(frameId)
      frameId = null
    }
  }

  const teardownNodes = (): void => {
    cancelFrame()
    if (sourceNode) {
      // Detach first: a node stopped while it still carries an `onended`
      // handler fires it, which would settle an entry that is on its way to
      // being rejected instead.
      sourceNode.onended = null
      try {
        sourceNode.stop()
        sourceNode.disconnect()
      } catch {
        // Already stopped, or never started - both are fine here.
      }
      sourceNode = null
    }
    if (gainNode) {
      try {
        gainNode.disconnect()
      } catch {
        // Already disconnected.
      }
      gainNode = null
    }
  }

  const trackProgress = (onProgress?: PlayOptions["onProgress"]): void => {
    if (typeof requestAnimationFrame !== "function") return
    const tick = (): void => {
      if (!context || !state.speaking || state.paused) return
      const elapsed = context.currentTime - startedAt
      setState({ currentTime: elapsed })
      onProgress?.(elapsed, state.duration)
      if (elapsed < state.duration) {
        frameId = requestAnimationFrame(tick)
      }
    }
    frameId = requestAnimationFrame(tick)
  }

  const begin = async (
    entry: PendingSpeech,
    audio: ArrayBuffer,
    playOptions: PlayOptions
  ): Promise<void> => {
    // The entry may already have been flushed while it waited its turn.
    if (entry.isSettled()) return
    if (disposed) {
      entry.reject(createAbortError("Audio player was disposed"))
      return
    }
    if (playOptions.signal?.aborted) {
      entry.reject(createAbortError("Playback aborted before it started"))
      return
    }

    const signal = playOptions.signal
    const onAbort = (): void => {
      teardownNodes()
      setState(IDLE_STATE)
      entry.reject(createAbortError("Playback aborted"))
    }
    if (signal) {
      signal.addEventListener("abort", onAbort, { once: true })
      // Detached when the entry settles, not when this function returns:
      // `begin` returns as soon as playback has *started*, and the whole
      // point of the listener is to interrupt what happens after that.
      const detach = (): void => signal.removeEventListener("abort", onAbort)
      void entry.promise.then(detach, detach)
    }

    try {
      if (!supported) {
        throw new Error("AudioContext is not supported in this runtime")
      }

      setState({ loading: true })
      teardownNodes()

      const ctx = getContext()
      if (ctx.state === "suspended") await ctx.resume()
      if (entry.isSettled()) return

      // `decodeAudioData` detaches the buffer it is given, so a retry of the
      // same utterance would otherwise decode an empty ArrayBuffer.
      const decoded = await ctx.decodeAudioData(audio.slice(0))
      if (entry.isSettled()) return

      const source = ctx.createBufferSource()
      const gain = ctx.createGain()
      source.buffer = decoded
      gain.gain.value = playOptions.volume ?? 1
      source.playbackRate.value = playOptions.playbackRate ?? 1
      source.connect(gain)
      gain.connect(ctx.destination)

      sourceNode = source
      gainNode = gain
      startedAt = ctx.currentTime

      source.onended = (): void => {
        if (entry.isSettled()) return
        teardownNodes()
        setState({ ...IDLE_STATE, duration: decoded.duration })
        playOptions.onEnd?.()
        entry.resolve()
      }

      setState({
        loading: false,
        speaking: true,
        paused: false,
        currentTime: 0,
        duration: decoded.duration,
      })

      source.start(0)
      playOptions.onStart?.()
      trackProgress(playOptions.onProgress)
    } catch (error) {
      teardownNodes()
      setState(IDLE_STATE)
      entry.reject(toError(error))
    }
  }

  const play = (
    audio: ArrayBuffer,
    playOptions: PlayOptions = {}
  ): Promise<void> => {
    if (disposed) {
      return Promise.reject(createAbortError("Audio player was disposed"))
    }

    const entry = ledger.open()
    const previous = tail
    // The next `play()` waits on this entry however it settles - including
    // via `flush`, which is what keeps `stop()` from wedging the chain.
    tail = entry.promise.then(
      () => undefined,
      () => undefined
    )

    void previous.then(
      () => begin(entry, audio, playOptions),
      () => begin(entry, audio, playOptions)
    )

    return entry.promise
  }

  return {
    supported,
    get pending(): number {
      return ledger.size
    },
    get disposed(): boolean {
      return disposed
    },
    get state(): AudioPlayerState {
      return state
    },
    play,
    stop: (): void => {
      teardownNodes()
      setState(IDLE_STATE)
      ledger.flush(createAbortError("Playback stopped"))
    },
    pause: (): void => {
      if (!context || !state.speaking || state.paused) return
      if (context.state !== "running") return
      pausedAt = context.currentTime
      void context.suspend()
      cancelFrame()
      setState({ paused: true })
    },
    resume: (): void => {
      if (!context || !state.paused) return
      if (context.state !== "suspended") return
      void context.resume()
      startedAt += context.currentTime - pausedAt
      setState({ paused: false })
      trackProgress()
    },
    setVolume: (volume: number): void => {
      if (gainNode) gainNode.gain.value = Math.max(0, Math.min(1, volume))
    },
    setPlaybackRate: (rate: number): void => {
      if (sourceNode) {
        sourceNode.playbackRate.value = Math.max(0.1, Math.min(4, rate))
      }
    },
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    dispose: (): void => {
      if (disposed) return
      disposed = true
      teardownNodes()
      setState(IDLE_STATE)
      ledger.flush(createAbortError("Audio player was disposed"))
      listeners.clear()
      if (context && context.state !== "closed") {
        void context.close().catch(() => undefined)
      }
      context = null
      tail = Promise.resolve()
    },
  }
}
