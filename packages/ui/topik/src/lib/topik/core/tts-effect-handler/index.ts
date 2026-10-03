/**
 * TTS Effect Handler - Serial Queue with Deduplication
 *
 * Speaks through the page's `Speaker` from `@some-ui/speech` - whichever
 * backend that session resolved to. This used to be typed against
 * `UseAudioTTSReturn`, the return value of a React hook, which meant this
 * pure-TypeScript handler's contract was "whatever shape that hook happens
 * to have today"; callbacks also had to be installed statefully via
 * `updateOptions` immediately before each `speak`, so the association
 * between a message and its own onStart/onEnd was positional and fragile.
 * Callbacks are per-utterance arguments now.
 *
 * Ensures:
 * - Messages speak one at a time (serial queue)
 * - No duplicate auto-play (Set-based deduplication)
 * - onEnd resolves before advancing
 * - Manual override clears deduplication
 * - Survives React Strict Mode (double effect calls)
 */

import type { Speaker } from "@some-ui/speech"
import { isAbortError, toError } from "@some-ui/speech"
import type { Message } from "@topik/lib/topik"
import type { ISessionMachine } from "@topik/lib/topik/core/session-types"
import { SPOKEN_LANGUAGE } from "@topik/lib/topik/core/spoken-language"

// ═══════════════════════════════════════════════════════════════════════════
// TTS EFFECT HANDLER CONFIG
// ═══════════════════════════════════════════════════════════════════════════

export type TTSEffectHandlerConfig = {
  speaker: Speaker
  componentId: string
  machine: ISessionMachine
  onMessageComplete?: (messageId: string) => void
  onSpeechStart?: (messageId: string) => void
  onSpeechEnd?: (messageId: string) => void
  onError?: (error: Error, messageId: string) => void
}

// ═══════════════════════════════════════════════════════════════════════════
// TTS EFFECT HANDLER
// ═══════════════════════════════════════════════════════════════════════════

export class TTSEffectHandler {
  private currentMessageId: string | null = null
  private speaking: boolean = false

  /**
   * Which `_speak` call owns the line in flight, so a call that a newer one
   * (a manual replay) or a stop has displaced cannot clear the newer line's
   * state, report its end, or undo its dedup when its own promise settles
   * late. Null when no line is in flight.
   */
  private runSeq = 0
  private activeRun: number | null = null

  /**
   * A line was refused because the session is muted. It is back at the
   * front of the queue, and the queue waits for unmute rather than marking
   * it spoken: TOPIK's lesson advances on a line's end, so a line skipped
   * while muted would leave the lesson stuck on it after unmuting.
   */
  private heldForUnmute = false
  private readonly unsubscribe: () => void

  // Deduplication tracking
  private spokenAutoIds: Set<string> = new Set()
  private completedIds: Set<string> = new Set()

  // Serial queue
  private queue: Array<{ message: Message; isAuto: boolean }> = []
  private processing: boolean = false

  constructor(private readonly config: TTSEffectHandlerConfig) {
    // Force stop any existing audio on construction (handles remount case)
    this.config.speaker.stop()
    this.unsubscribe = this.config.speaker.subscribe(() => {
      this.resumeAfterUnmute()
    })
  }

  // ═════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Enqueue a message for speaking
   * Auto-play messages are deduplicated
   */
  enqueue(message: Message, isAuto: boolean = true): void {
    // Deduplicate auto-play
    if (isAuto && this.spokenAutoIds.has(message.id)) {
      return
    }

    this.queue.push({ message, isAuto })

    // Start processing if not already running
    if (!this.processing) {
      void this.processQueue()
    }
  }

  /**
   * Manual speak (UI-triggered)
   * Clears deduplication for this message
   */
  async speakManually(message: Message): Promise<void> {
    // Clear deduplication for this message
    this.spokenAutoIds.delete(message.id)
    this.completedIds.delete(message.id)

    // Clear queue and stop current speech
    this.queue = []
    this.heldForUnmute = false
    this.config.speaker.stop()

    // Speak immediately (not auto-play)
    await this._speak(message, false)
  }

  /**
   * Stop current speech and clear queue
   */
  handleStopAudio(): void {
    if (this.currentMessageId) {
      this.config.speaker.stop()
      this.speaking = false

      const stoppedId = this.currentMessageId
      this.currentMessageId = null
      this.activeRun = null

      this.config.onSpeechEnd?.(stoppedId)
    }

    // Clear queue
    this.queue = []
    this.heldForUnmute = false
  }

  isSpeaking(): boolean {
    return this.speaking
  }

  getCurrentMessageId(): string | null {
    return this.currentMessageId
  }

  reset(): void {
    this.handleStopAudio()
    this.spokenAutoIds.clear()
    this.completedIds.clear()
    this.processing = false
  }

  destroy(): void {
    this.unsubscribe()
    this.handleStopAudio()
    this.config.speaker.stop()
    this.spokenAutoIds.clear()
    this.completedIds.clear()
  }

  // ═════════════════════════════════════════════════════════════════════════
  // PRIVATE QUEUE PROCESSOR
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Process queue serially - one message at a time
   */
  private async processQueue(): Promise<void> {
    this.processing = true

    while (this.queue.length > 0 && !this.heldForUnmute) {
      const { message, isAuto } = this.queue.shift()!

      // Double-check deduplication (in case queue was filled before processing)
      if (isAuto && this.spokenAutoIds.has(message.id)) {
        continue
      }

      try {
        await this._speak(message, isAuto)
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(`[TTS] Error speaking ${message.id}:`, error)
        // Continue processing queue even on error
      }
    }

    this.processing = false
  }

  /** Picks the held line back up once the session is unmuted. */
  private resumeAfterUnmute(): void {
    if (!this.heldForUnmute || this.config.speaker.muted) return
    this.heldForUnmute = false
    if (!this.processing && this.queue.length > 0) void this.processQueue()
  }

  /**
   * Read through methods rather than the field, so a check after an `await`
   * sees the current value: TypeScript keeps a field's narrowing across the
   * await even though a stop or a newer line may have run during it.
   */
  private isCurrent(run: number): boolean {
    return this.activeRun === run
  }

  /**
   * A newer line has started since this one, whether or not it is still in
   * flight: a cancellation can settle after the replay that caused it has
   * already finished.
   */
  private isSuperseded(run: number): boolean {
    return this.runSeq !== run
  }

  /**
   * Speak a single message and wait for completion
   */
  private async _speak(message: Message, isAuto: boolean): Promise<void> {
    this.runSeq += 1
    const run = this.runSeq
    this.activeRun = run
    this.currentMessageId = message.id
    this.speaking = true

    let completionFired = false // Guard against double-firing

    const release = (): void => {
      if (!this.isCurrent(run)) return
      this.activeRun = null
      this.speaking = false
      this.currentMessageId = null
    }

    const cleanupAndComplete = (): void => {
      if (completionFired) return
      completionFired = true

      // Displaced by a newer line (a manual replay of this very message,
      // say): its state, its end and its dedup are its own to settle.
      if (this.isSuperseded(run)) return
      release()

      // Mark as spoken for deduplication
      if (isAuto) {
        this.spokenAutoIds.add(message.id)
      }

      // Fire completion callback ONLY ONCE per message
      if (isAuto && !this.completedIds.has(message.id)) {
        this.completedIds.add(message.id)
        this.config.onMessageComplete?.(message.id)
      }
    }

    try {
      // Await the line - this blocks until the audio completes. The callback
      // belongs to *this* utterance, so a later one cannot finish an earlier
      // one's bookkeeping.
      await this.config.speaker.say(message.content, {
        lang: SPOKEN_LANGUAGE,
        onStart: () => {
          this.config.onSpeechStart?.(message.id)
        },
      })
      // `handleStopAudio` reports a stopped line's end itself, and a line
      // can finish in the same tick it is stopped; only a line that is still
      // this run's own reports its end here.
      if (this.isCurrent(run)) this.config.onSpeechEnd?.(message.id)
      cleanupAndComplete()
    } catch (error) {
      if (
        isAuto &&
        isAbortError(error) &&
        this.config.speaker.muted &&
        this.isCurrent(run)
      ) {
        // Refused, or cut off, by mute: not heard, so not spoken. Hold it
        // at the front of the queue until unmute replays it. A replay the
        // learner pressed while muted is theirs to press again.
        completionFired = true
        release()
        this.queue.unshift({ message, isAuto })
        this.heldForUnmute = true
        return
      }
      // A cancellation (a stop, a newer line) is not an error and does not
      // end the line: the queue just moves on. A real
      // failure does, so the lesson is not left waiting on a line that will
      // never be heard.
      if (this.isCurrent(run) && !isAbortError(error)) {
        const failure = toError(error)
        // eslint-disable-next-line no-console
        console.error(`[TTS] ❌ Error: ${message.id}`, failure)
        this.config.onError?.(failure, message.id)
        this.config.onSpeechEnd?.(message.id)
      }
      cleanupAndComplete()
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════════════════════════════════

export function createTTSEffectHandler(
  config: TTSEffectHandlerConfig
): TTSEffectHandler {
  return new TTSEffectHandler(config)
}
