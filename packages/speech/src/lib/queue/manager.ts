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

import type {
  DeviceVoiceChoice,
  SpeechAdapter,
  VoiceReport,
} from "@speech/lib/adapters/types"
import {
  createAbortError,
  isAbortError,
  toError,
} from "@speech/lib/promise/abort"
import type {
  PreviewOptions,
  SayOptions,
  Speaker,
  SpeechOutcome,
  Urgency,
} from "@speech/lib/speaker"
import type { TTSOptions } from "@speech/lib/types/tts-types"

import type { SpeechAction } from "./actions"
import { generateId } from "./actions"
import { speechReducer } from "./reducer"
import type { Store } from "./store"
import { createStore } from "./store"
import type { SpeechItem, SpeechQueueState } from "./types"

/** A `"now"` line goes ahead of everything, and interrupts what plays. */
const NOW_PRIORITY = Number.MAX_SAFE_INTEGER
const NEXT_PRIORITY = 0

/** The owner of preview lines; `useId`'s ids never take this shape. */
const PREVIEW_OWNER = "speech-session:voice-preview"

/** Why the session stopped an item, when it was the session that did. */
type Ending = "preempted" | "cancelled" | "muted" | "ended"

const ENDED: SpeechOutcome = { kind: "ended" }
const MUTED: SpeechOutcome = { kind: "muted" }
const CANCELLED: SpeechOutcome = { kind: "cancelled" }

function outcomeOf(ending: Ending): SpeechOutcome {
  return { kind: ending }
}

/** A speaker's line, while it is queued or playing. */
type Line = {
  readonly urgency: Urgency
  readonly onInterrupted: (() => void) | undefined
  readonly settle: (outcome: SpeechOutcome) => void
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
  private pumpScheduled = false
  private inFlight: SpeechItem | null = null
  private disposed = false
  private muted = false

  /** Who to tell when `muted` or the adapter's voices change. */
  private readonly speakerListeners = new Set<() => void>()
  private readonly unsubscribeAdapter: () => void

  /** Each speaker line in the queue or playing, by item id. */
  private readonly lines = new Map<string, Line>()
  /**
   * Why an item's controller was aborted, recorded by whoever aborts it,
   * before it does: the outcome is the session's to state, not the line's
   * to infer.
   */
  private readonly endings = new Map<string, Ending>()

  constructor(adapter: SpeechAdapter) {
    this.adapter = adapter
    this.store = createStore(INITIAL_STATE, speechReducer)
    this.unsubscribeAdapter = adapter.subscribe(() => this.notifySpeaker())
  }

  private notifySpeaker(): void {
    for (const listener of [...this.speakerListeners]) listener()
  }

  // ── Speaker ──────────────────────────────────────────────────────────────

  /**
   * A handle for one applet (`owner`): its lines go through this session's
   * queue, and its `stop` reaches only them. See `lib/speaker`.
   */
  speakerFor(owner: string): Speaker {
    const isMuted = (): boolean => this.muted
    return {
      available: this.adapter.supported,
      say: (text, options): Promise<SpeechOutcome> =>
        this.say(owner, text, options),
      stop: (): void => this.cancelOwner(owner, "cancelled"),
      describe: (language): VoiceReport => this.adapter.describe(language),
      get muted(): boolean {
        return isMuted()
      },
      subscribe: (listener): (() => void) => {
        this.speakerListeners.add(listener)
        return (): void => {
          this.speakerListeners.delete(listener)
        }
      },
    }
  }

  /**
   * Says `text` in a voice a person is choosing between (Settings' sample),
   * as a `"now"` line through the queue like any other, so it interrupts
   * what plays and honors mute instead of writing to the engine behind the
   * session's back. The one line a voice is named for, which an applet's
   * `say` cannot do.
   */
  preview(text: string, options: PreviewOptions): Promise<SpeechOutcome> {
    return this.say(
      PREVIEW_OWNER,
      text,
      { language: options.language, urgency: "now" },
      options.voice
    )
  }

  private say(
    owner: string,
    text: string,
    options: SayOptions,
    voice?: DeviceVoiceChoice
  ): Promise<SpeechOutcome> {
    if (this.disposed) return Promise.resolve(ENDED)
    // Refused rather than queued, for the reason `speak` drops muted items.
    if (this.muted) return Promise.resolve(MUTED)
    if (options.signal?.aborted) return Promise.resolve(CANCELLED)

    const urgency = options.urgency ?? "next"
    const id = generateId()
    return new Promise<SpeechOutcome>((resolve) => {
      const onAbort = (): void => this.cancelItem(id, "cancelled")
      this.lines.set(id, {
        urgency,
        onInterrupted: options.onInterrupted,
        settle: (outcome): void => {
          options.signal?.removeEventListener("abort", onAbort)
          resolve(outcome)
        },
      })
      options.signal?.addEventListener("abort", onAbort, { once: true })

      const current = this.store.get().currentItem
      if (current && urgency === "now") this.interrupt(current)

      this.store.dispatch({
        type: "SPEAK",
        payload: {
          componentId: owner,
          text,
          id,
          // A line is said once: a failure is the applet's to handle (a
          // lesson moves on), not the queue's to repeat.
          maxRetries: 0,
          options: {
            language: options.language,
            voice,
            part: options.part,
            volume: options.volume,
            playbackRate: options.playbackRate,
            onStart: options.onStart,
            onBoundary: options.onBoundary,
          },
        },
        priority: urgency === "now" ? NOW_PRIORITY : NEXT_PRIORITY,
      })
      this.schedulePump()
    })
  }

  /** Ends a line with `outcome`, once. */
  private settleLine(id: string, outcome: SpeechOutcome): void {
    const line = this.lines.get(id)
    if (!line) return
    this.lines.delete(id)
    line.settle(outcome)
  }

  /** Stops the playing item so another can play, recording why. */
  private interrupt(current: SpeechItem): void {
    this.recordEnding(current.id, "preempted")
    current.controller.abort()
  }

  /**
   * The first reason recorded for an item wins over an interruption, until
   * its abort lands: a line its owner stopped, or that mute cut off, must
   * not be replayed because something interrupted it in the same moment.
   */
  private recordEnding(id: string, ending: Ending): void {
    if (ending === "preempted" && this.endings.has(id)) return
    this.endings.set(id, ending)
  }

  /**
   * Cancels one item, playing or waiting. A waiting line is settled here;
   * a playing one when its abort lands in `pump`.
   */
  private cancelItem(id: string, ending: Ending): void {
    if (this.disposed) return
    const state = this.store.get()
    if (state.currentItem?.id === id) {
      this.endings.set(id, ending)
    } else if (state.items.some((item) => item.id === id)) {
      this.settleLine(id, outcomeOf(ending))
    }
    this.store.dispatch({ type: "CANCEL", payload: { itemId: id } })
    this.schedulePump()
  }

  /** Cancels every item `owner` has, playing or waiting. */
  private cancelOwner(owner: string, ending: Ending): void {
    if (this.disposed) return
    const state = this.store.get()
    if (state.currentItem?.componentId === owner) {
      this.endings.set(state.currentItem.id, ending)
    }
    for (const item of state.items) {
      if (item.componentId === owner)
        this.settleLine(item.id, outcomeOf(ending))
    }
    this.store.dispatch({ type: "CANCEL", payload: { componentId: owner } })
    this.schedulePump()
  }

  /** Ends every line, playing or waiting, with `ending`. */
  private endAll(ending: Ending): void {
    const state = this.store.get()
    if (state.currentItem) this.endings.set(state.currentItem.id, ending)
    for (const item of state.items) this.settleLine(item.id, outcomeOf(ending))
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
      this.interrupt(current)
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
    if (itemId) this.cancelItem(itemId, "cancelled")
    else if (componentId) this.cancelOwner(componentId, "cancelled")
  }

  pause(): void {
    if (this.disposed) return
    // A paused line is interrupted like any other: a "next" one plays
    // again on resume, a "now" one is over.
    const current = this.store.get().currentItem
    if (current) this.recordEnding(current.id, "preempted")
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
    this.endAll("cancelled")
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
      this.endAll("muted")
      this.store.dispatch({ type: "CLEAR" })
      this.adapter.stop()
    } else {
      this.schedulePump()
    }
    this.notifySpeaker()
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
    for (const id of [...this.lines.keys()]) this.settleLine(id, ENDED)
    this.endings.clear()
    this.adapter.stop()
    this.unsubscribeAdapter()
    this.speakerListeners.clear()
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
        this.finishAborted(next, createAbortError("Cancelled before it began"))
        return
      }

      await this.adapter.speak(next.text, {
        signal: next.controller.signal,
        language: next.options?.language,
        voice: next.options?.voice,
        part: next.options?.part,
        volume: next.options?.volume,
        playbackRate: next.options?.playbackRate,
        onStart: next.options?.onStart,
        onEnd: next.options?.onEnd,
        onError: next.options?.onError,
        onProgress: next.options?.onProgress,
        onBoundary: next.options?.onBoundary,
      })

      // `this.isDisposed()` rather than `this.disposed`: the field was
      // narrowed to `false` by the guard at the top of this method, and TS
      // keeps that narrowing across the await even though `dispose()` may
      // well have run during it.
      if (this.isDisposed()) return
      this.endings.delete(next.id)
      this.store.dispatch({
        type: "ITEM_COMPLETED",
        payload: { itemId: next.id },
      })
      this.settleLine(next.id, { kind: "heard" })
    } catch (error) {
      if (this.isDisposed()) return
      const failure = toError(error)

      if (isAbortError(failure)) {
        this.finishAborted(next, failure)
      } else {
        this.endings.delete(next.id)
        const shouldRetry = next.retryCount < next.maxRetries
        this.store.dispatch({
          type: "ITEM_FAILED",
          payload: { itemId: next.id, error: failure.message, shouldRetry },
        })
        if (!shouldRetry) {
          this.settleLine(next.id, { kind: "failed", error: failure })
        }
      }
    } finally {
      this.inFlight = null
      // Whatever became of that item, the queue may have more work - and
      // this is the only edge that reliably follows every outcome, so it is
      // where the next pump gets scheduled from.
      this.schedulePump()
    }
  }

  /**
   * The playing item was stopped. Whoever stopped it recorded why
   * (`endings`); a "next" line that was only interrupted goes back in the
   * queue, to play after whatever interrupted it. An abort the session did
   * not cause (the platform stopping speech by itself) is not something a
   * line can wait out, so it fails with the platform's error.
   */
  private finishAborted(item: SpeechItem, failure: Error): void {
    const ending = this.endings.get(item.id)
    this.endings.delete(item.id)
    const line = this.lines.get(item.id)
    const requeue =
      line !== undefined &&
      ending === "preempted" &&
      line.urgency === "next" &&
      !this.muted
    // Back in the queue before the item stops being current, so the store
    // never reads as idle in between (`whenIdle`, chat's `isActive`).
    if (requeue) this.store.dispatch({ type: "REQUEUE", payload: { item } })
    this.store.dispatch({
      type: "ITEM_CANCELLED",
      payload: { itemId: item.id },
    })
    if (!line) return
    if (requeue) {
      line.onInterrupted?.()
      return
    }
    this.settleLine(
      item.id,
      ending ? outcomeOf(ending) : { kind: "failed", error: failure }
    )
  }
}
