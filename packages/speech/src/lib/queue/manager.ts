/**
 * @module queue/manager
 *
 * Drives the speech queue: one utterance at a time, priority-ordered, with
 * retries, against whichever `SpeechAdapter` the session was built with.
 *
 * ## What changed, and why it mattered
 *
 * The previous manager awaited `ttsHook.speak(text)` with no way to
 * interrupt it. Cancelling an item aborted its `AbortController`, which the
 * loop only ever checked *before* and *after* that await - so a cancel
 * mid-utterance did nothing until the audio ended on its own, and if the
 * underlying promise never settled (the common case, since the hook it
 * called dropped its pending promises on `stop()`) the loop parked forever
 * holding `currentItem`. Every later `speak()` piled up behind a queue that
 * would never advance again, and because the manager was a module-level
 * singleton, "later" included the next session, the next page, the next
 * provider. That is the "prior state poisons the new session" report.
 *
 * Now the item's signal goes *into* `adapter.speak()`, whose contract
 * (`adapters/types.ts`) is that aborting it rejects promptly with an
 * `AbortError`; and `dispose()` tears the whole session down - aborts every
 * item, flushes every promise, drops every listener - so a new session
 * starts from nothing.
 */

import type { SpeechAdapter } from "@speech/lib/adapters/types"
import { isAbortError, toError } from "@speech/lib/promise/abort"
import type { TTSOptions, VoiceConfig } from "@speech/lib/types/tts-types"

import type { SpeechAction } from "./actions"
import { speechReducer } from "./reducer"
import type { Store } from "./store"
import { createStore } from "./store"
import type { SpeechItem, SpeechQueueState } from "./types"

export type SpeechQueueManagerOptions = {
  /** Voice used by items that don't name one of their own. */
  defaultVoice?: VoiceConfig | null
}

const INITIAL_STATE: SpeechQueueState = {
  items: [],
  currentItem: null,
  status: "idle",
  error: null,
  totalProcessed: 0,
  totalFailed: 0,
}

export class SpeechQueueManager {
  private readonly store: Store<SpeechQueueState, SpeechAction>
  private readonly adapter: SpeechAdapter
  private defaultVoice: VoiceConfig | null
  private pumpScheduled = false
  private inFlight: SpeechItem | null = null
  private disposed = false
  private muted = false

  constructor(adapter: SpeechAdapter, options: SpeechQueueManagerOptions = {}) {
    this.adapter = adapter
    this.defaultVoice = options.defaultVoice ?? null
    this.store = createStore(INITIAL_STATE, speechReducer)
  }

  // ── Queue API ────────────────────────────────────────────────────────────

  speak(
    componentId: string,
    text: string,
    options?: TTSOptions,
    priority = 0,
    maxRetries = 2
  ): void {
    if (this.disposed) return
    // Muted utterances are dropped, not queued. Queuing them would mean
    // that unmuting replays everything the person chose not to hear -
    // minutes of backlog arriving at once, which is exactly the surprise
    // muting was meant to prevent.
    if (this.muted) return

    const current = this.store.get().currentItem
    if (current && priority > current.priority) {
      // Interrupt: aborting the controller is what actually stops the
      // adapter - the in-flight `speak()` rejects with an `AbortError` and
      // the pump records `ITEM_CANCELLED`. No `adapter.stop()` here: that
      // would also flush utterances belonging to other components.
      current.controller.abort()
    }

    this.store.dispatch({
      type: "SPEAK",
      payload: { componentId, text, options, maxRetries },
      priority,
    })
    this.schedulePump()
  }

  cancel(componentId?: string, itemId?: string): void {
    if (this.disposed) return
    this.store.dispatch({ type: "CANCEL", payload: { componentId, itemId } })
    this.schedulePump()
  }

  pause(): void {
    if (this.disposed) return
    this.store.dispatch({ type: "PAUSE" })
    this.adapter.pause()
  }

  resume(): void {
    if (this.disposed) return
    this.store.dispatch({ type: "RESUME" })
    this.adapter.resume()
    this.schedulePump()
  }

  clear(): void {
    if (this.disposed) return
    this.store.dispatch({ type: "CLEAR" })
    this.adapter.stop()
  }

  // ── Accessors ────────────────────────────────────────────────────────────

  getStore(): Store<SpeechQueueState, SpeechAction> {
    return this.store
  }

  getAdapter(): SpeechAdapter {
    return this.adapter
  }

  getVoices(): ReadonlyArray<VoiceConfig> {
    return this.adapter.voices
  }

  getDefaultVoice(): VoiceConfig | null {
    return this.defaultVoice
  }

  setDefaultVoice(voice: VoiceConfig | null): void {
    this.defaultVoice = voice
  }

  isDisposed(): boolean {
    return this.disposed
  }

  isMuted(): boolean {
    return this.muted
  }

  /**
   * Turns voice output off or on for this session.
   *
   * Muting stops what is speaking now and drops what was queued - a person
   * who mutes wants silence immediately, not after the current paragraph.
   * It is not `pause`: pause preserves the queue to resume from, and this
   * deliberately does not.
   */
  setMuted(muted: boolean): void {
    if (this.disposed || muted === this.muted) return
    this.muted = muted
    if (muted) {
      this.store.dispatch({ type: "CLEAR" })
      this.adapter.stop()
      return
    }
    this.schedulePump()
  }

  /**
   * Resolves once nothing is in flight and nothing is queued. Exists for
   * tests and for teardown paths that want to let the current utterance
   * finish; ordinary callers should not need it.
   */
  whenIdle(): Promise<void> {
    // Read from the store rather than `inFlight`: subscribers are notified
    // from inside `dispatch`, which runs before the pump's `finally` has
    // cleared `inFlight`, so an `inFlight` check here would never see the
    // drain it is waiting for.
    const settled = (): boolean => {
      const state = this.store.get()
      return state.currentItem === null && state.items.length === 0
    }

    if (settled()) return Promise.resolve()

    return new Promise<void>((resolve) => {
      const unsubscribe = this.store.subscribe(
        (state) => `${state.status}:${state.items.length}`,
        () => {
          if (!settled()) return
          unsubscribe()
          resolve()
        }
      )
    })
  }

  /**
   * Ends the session. Every queued and in-flight item is aborted, every
   * promise the adapter still owes is flushed, and the store stops
   * notifying. Idempotent, and irreversible by design: a disposed manager
   * must never be able to speak again, because the whole point is that a
   * finished session cannot reach into the next one.
   */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    // Silence the store first, then clear: `CLEAR` still runs the reducer
    // (which is what aborts every item's controller), but nothing that
    // outlived this session gets woken by its last breath.
    this.store.dispose()
    this.store.dispatch({ type: "CLEAR" })
    this.inFlight = null
    this.adapter.stop()
  }

  // ── Processing ───────────────────────────────────────────────────────────

  private schedulePump(): void {
    if (this.pumpScheduled || this.disposed) return
    this.pumpScheduled = true
    queueMicrotask(() => {
      this.pumpScheduled = false
      void this.pump()
    })
  }

  private async pump(): Promise<void> {
    if (this.disposed || this.inFlight) return

    const state = this.store.get()
    if (state.status === "paused" || state.currentItem) return

    const next = state.items[0]
    if (!next) return

    this.inFlight = next
    this.store.dispatch({ type: "ITEM_STARTED", payload: { item: next } })

    try {
      if (next.controller.signal.aborted) {
        this.store.dispatch({
          type: "ITEM_CANCELLED",
          payload: { itemId: next.id },
        })
        return
      }

      await this.adapter.speak(next.text, {
        signal: next.controller.signal,
        voice: next.options?.voice ?? this.defaultVoice,
        volume: next.options?.volume,
        playbackRate: next.options?.playbackRate,
        onStart: next.options?.onStart,
        onEnd: next.options?.onEnd,
        onError: next.options?.onError,
        onProgress: next.options?.onProgress,
      })

      // `this.isDisposed()` rather than `this.disposed`: the field was
      // narrowed to `false` by the guard at the top of this method, and TS
      // keeps that narrowing across the await even though `dispose()` may
      // well have run during it.
      if (this.isDisposed()) return
      this.store.dispatch({
        type: "ITEM_COMPLETED",
        payload: { itemId: next.id },
      })
    } catch (error) {
      if (this.isDisposed()) return
      const failure = toError(error)

      if (isAbortError(failure)) {
        this.store.dispatch({
          type: "ITEM_CANCELLED",
          payload: { itemId: next.id },
        })
      } else {
        this.store.dispatch({
          type: "ITEM_FAILED",
          payload: {
            itemId: next.id,
            error: failure.message,
            shouldRetry: next.retryCount < next.maxRetries,
          },
        })
      }
    } finally {
      this.inFlight = null
      // Whatever became of that item, the queue may have more work - and
      // this is the only edge that reliably follows every outcome, so it is
      // where the next pump gets scheduled from.
      this.schedulePump()
    }
  }
}
