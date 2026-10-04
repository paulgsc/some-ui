/**
 * TTS Effect Handler - a lesson's lines, one at a time, through the page's
 * speech session.
 *
 * The session (`@some-ui/speech`) is the one writer of the page's voice:
 * this handler submits each line through its own `Speaker` handle and is
 * told what became of it (`SpeechOutcome`), so nothing here infers why a
 * line stopped from state another applet may have changed meanwhile.
 *
 * - **Lesson lines are `"next"`.** They play in order, and when another
 *   applet's `"now"` line (a tapped word) interrupts one, the session plays
 *   it again afterwards; `onInterrupted` clears "speaking" meanwhile.
 * - **A replay is `"now"`.** The learner pressed it: it cancels this
 *   handler's own lines and plays at once. It goes through the same queue
 *   as lesson lines, so this handler has one line in hand at a time and one
 *   path that writes it; a replay beside the queue let a lesson line queued
 *   during it take over, and the replay's end was lost.
 * - **The lesson advances only on a heard (or failed) line** (`onSpeechEnd`,
 *   which the executor turns into `ADVANCE_MESSAGE`). A lesson line the
 *   session refused or cut off because the person muted is held at the
 *   front of the queue and said again on unmute. A replay is not held:
 *   played later, it would land among lesson lines queued since, each
 *   advancing the lesson.
 * - **No duplicate auto-play.** A lesson line already heard is not said
 *   again when its effect is re-dispatched (React Strict Mode); a replay
 *   clears that, so the line can auto-play again later.
 */

import type { Speaker, SpeechOutcome, Urgency } from "@some-ui/speech"
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
  /**
   * The line's audio stopped without the line ending: it was muted, or
   * another applet's line interrupted it (the session plays it again
   * after). Whoever shows "speaking" clears it here; the lesson does not
   * advance, as it does on `onSpeechEnd`.
   */
  onSpeechStopped?: (messageId: string) => void
  onError?: (error: Error, messageId: string) => void
}

type Entry = {
  readonly message: Message
  readonly isAuto: boolean
  readonly urgency: Urgency
  /** Resolves `speakManually`'s promise once the line is done with. */
  readonly done?: () => void
}

/** The line in hand: submitted, playing, or held for unmute. */
type Line = Entry & { playing: boolean }

// ═══════════════════════════════════════════════════════════════════════════
// TTS EFFECT HANDLER
// ═══════════════════════════════════════════════════════════════════════════

export class TTSEffectHandler {
  /**
   * The line in hand. A line that a stop or a replay has replaced is no
   * longer it, so whatever its outcome is when it lands, it is not this
   * handler's to act on any more: whoever replaced it has already done the
   * bookkeeping.
   */
  private line: Line | null = null

  /** `line` is a lesson line the session refused or cut off while muted. */
  private held = false
  private readonly unsubscribe: () => void

  // Deduplication tracking
  private spokenAutoIds: Set<string> = new Set()
  private completedIds: Set<string> = new Set()

  // Serial queue
  private queue: Array<Entry> = []
  private processing: boolean = false

  constructor(private readonly config: TTSEffectHandlerConfig) {
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
    if (isAuto && this.spokenAutoIds.has(message.id)) return
    this.queue.push({ message, isAuto, urgency: "next" })
    if (!this.processing) void this.processQueue()
  }

  /**
   * A replay the learner pressed: replaces whatever this handler has in
   * hand or queued, and plays at once. Clears the message's dedup.
   */
  async speakManually(message: Message): Promise<void> {
    // A muted session would refuse it. Pressing replay while muted changes
    // nothing, so a held lesson line keeps its place: dropping it for a
    // replay that cannot play would leave the lesson waiting on it.
    if (this.config.speaker.muted) return

    this.spokenAutoIds.delete(message.id)
    this.completedIds.delete(message.id)
    this.dropQueue()
    this.held = false
    // The line this replaces stops here, and nothing reports it later: its
    // outcome is not this handler's any more. The replay may not start
    // (muted or interrupted before its audio arrives), so "speaking" is
    // cleared now rather than left for the replay's start to overwrite.
    const replaced = this.line
    this.line = null
    if (replaced?.playing) this.config.onSpeechStopped?.(replaced.message.id)
    this.config.speaker.stop()

    await new Promise<void>((done) => {
      this.queue.push({ message, isAuto: false, urgency: "now", done })
      if (!this.processing) void this.processQueue()
    })
  }

  /**
   * Stop: the line in hand ends (as far as the lesson is concerned, which
   * moves on), and the queue is dropped.
   */
  handleStopAudio(): void {
    const line = this.line
    this.line = null
    this.held = false
    this.dropQueue()
    if (!line) return

    this.config.speaker.stop()
    this.config.onSpeechEnd?.(line.message.id)
    if (line.isAuto) this.markSpoken(line.message.id)
  }

  isSpeaking(): boolean {
    return this.line?.playing === true
  }

  getCurrentMessageId(): string | null {
    return this.line?.playing === true ? this.line.message.id : null
  }

  reset(): void {
    this.handleStopAudio()
    this.spokenAutoIds.clear()
    this.completedIds.clear()
    this.processing = false
  }

  /**
   * Teardown. Ends nothing: the session's lesson must not advance past a
   * line because the handler speaking it went away (an executor rebuilt
   * around the same session machine would skip it unheard).
   */
  destroy(): void {
    this.unsubscribe()
    this.line = null
    this.held = false
    this.dropQueue()
    this.config.speaker.stop()
    this.spokenAutoIds.clear()
    this.completedIds.clear()
  }

  // ═════════════════════════════════════════════════════════════════════════
  // PRIVATE
  // ═════════════════════════════════════════════════════════════════════════

  /** Drops every queued line, telling any replay waiting on one. */
  private dropQueue(): void {
    const dropped = this.queue
    this.queue = []
    for (const entry of dropped) entry.done?.()
  }

  private async processQueue(): Promise<void> {
    this.processing = true
    while (this.queue.length > 0 && !this.held) {
      const entry = this.queue.shift()!
      if (entry.isAuto && this.spokenAutoIds.has(entry.message.id)) continue
      await this.speak(entry)
    }
    this.processing = false
  }

  /** Says the held line again once the session is unmuted. */
  private resumeAfterUnmute(): void {
    if (!this.held || this.config.speaker.muted) return
    this.held = false
    this.line = null
    if (!this.processing && this.queue.length > 0) void this.processQueue()
  }

  /** Dedup for an auto line, and its completion, reported once. */
  private markSpoken(messageId: string): void {
    this.spokenAutoIds.add(messageId)
    if (this.completedIds.has(messageId)) return
    this.completedIds.add(messageId)
    this.config.onMessageComplete?.(messageId)
  }

  private async speak(entry: Entry): Promise<void> {
    const line: Line = { ...entry, playing: false }
    const id = entry.message.id
    this.line = line

    const outcome = await this.config.speaker.say(entry.message.content, {
      language: SPOKEN_LANGUAGE,
      urgency: entry.urgency,
      onStart: () => {
        if (this.line !== line) return
        line.playing = true
        this.config.onSpeechStart?.(id)
      },
      onInterrupted: () => {
        if (this.line !== line) return
        line.playing = false
        this.config.onSpeechStopped?.(id)
      },
    })

    // Replaced by a stop or a replay, which settled it already.
    if (this.line === line) this.settle(line, outcome)
    entry.done?.()
  }

  private settle(line: Line, outcome: SpeechOutcome): void {
    const id = line.message.id
    const wasPlaying = line.playing
    line.playing = false

    switch (outcome.kind) {
      case "heard": {
        this.line = null
        this.config.onSpeechEnd?.(id)
        if (line.isAuto) this.markSpoken(id)
        return
      }
      case "failed": {
        // Ends the line, so the lesson is not left waiting on one that will
        // never be heard.
        this.line = null
        // eslint-disable-next-line no-console
        console.error(`[TTS] ❌ Error: ${id}`, outcome.error)
        this.config.onError?.(outcome.error, id)
        this.config.onSpeechEnd?.(id)
        if (line.isAuto) this.markSpoken(id)
        return
      }
      case "muted": {
        if (wasPlaying) this.config.onSpeechStopped?.(id)
        if (line.isAuto) {
          // Not heard, so not spoken: kept in hand, and first in line.
          this.queue.unshift({
            message: line.message,
            isAuto: true,
            urgency: "next",
          })
          this.held = true
        } else {
          this.line = null
        }
        return
      }
      case "preempted":
      case "cancelled":
      case "ended": {
        // A replay another applet's replay interrupted; or a line cancelled
        // or ended by something other than this handler's own stop (which
        // replaces the line first). Not heard, and nothing to say again.
        this.line = null
        if (wasPlaying) this.config.onSpeechStopped?.(id)
        return
      }
      default: {
        return assertNever(outcome)
      }
    }
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled speech outcome: ${JSON.stringify(value)}`)
}

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════════════════════════════════

export function createTTSEffectHandler(
  config: TTSEffectHandlerConfig
): TTSEffectHandler {
  return new TTSEffectHandler(config)
}
