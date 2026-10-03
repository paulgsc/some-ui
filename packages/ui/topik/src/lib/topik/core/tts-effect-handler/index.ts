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

  // Reference to the resolver of the currently active speech promise
  private activeResolve: (() => void) | null = null
  private activeReject: ((error: Error) => void) | null = null

  // Deduplication tracking
  private spokenAutoIds: Set<string> = new Set()
  private completedIds: Set<string> = new Set()

  // Serial queue
  private queue: Array<{ message: Message; isAuto: boolean }> = []
  private processing: boolean = false

  constructor(private readonly config: TTSEffectHandlerConfig) {
    // Force stop any existing audio on construction (handles remount case)
    this.config.speaker.stop()
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
    this.config.speaker.stop()

    // Reject any pending promise
    if (this.activeReject) {
      this.activeReject(new Error("Interrupted by manual speak"))
      this.activeReject = null
      this.activeResolve = null
    }

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

      this.config.onSpeechEnd?.(stoppedId)

      // Resolve the active promise to unblock the queue
      if (this.activeResolve) {
        this.activeResolve()
        this.activeResolve = null
        this.activeReject = null
      }
    }

    // Clear queue
    this.queue = []
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

    while (this.queue.length > 0) {
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

  /**
   * Read through a method rather than the field, so a check after an
   * `await` sees the current value: TypeScript keeps a field's narrowing
   * across the await even though `handleStopAudio` may have run during it.
   */
  private isCurrent(messageId: string): boolean {
    return this.currentMessageId === messageId
  }

  /**
   * Speak a single message and wait for completion
   */
  private async _speak(message: Message, isAuto: boolean): Promise<void> {
    this.currentMessageId = message.id
    this.speaking = true

    let completionFired = false // Guard against double-firing

    const cleanupAndComplete = (): void => {
      if (completionFired) return
      completionFired = true

      this.speaking = false
      this.currentMessageId = null
      this.activeResolve = null
      this.activeReject = null

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
      if (this.isCurrent(message.id)) this.config.onSpeechEnd?.(message.id)
      cleanupAndComplete()
    } catch (error) {
      // A cancellation (a stop, a newer line, a muted session) is not an
      // error and does not end the line: the queue just moves on. A real
      // failure does, so the lesson is not left waiting on a line that will
      // never be heard.
      if (this.isCurrent(message.id) && !isAbortError(error)) {
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
