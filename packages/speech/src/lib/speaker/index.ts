/**
 * @module speaker
 *
 * How a page's applets speak: by asking the speech session, never by
 * writing to an adapter.
 *
 * The session is the one writer of the page's voice. An adapter plays one
 * line at a time, and a line said over another cancels it, so two applets
 * writing to it directly could never know whose line was playing or why
 * theirs stopped: each would have to guess, from shared state read after
 * the fact, whether it was muted, interrupted or stopped. Instead every
 * applet gets its own `Speaker`, a handle on the session that submits
 * requests and is told what became of each one. Which line plays, which
 * waits and which is interrupted is decided in one place, the session's
 * queue (`lib/queue`), by the policy below.
 *
 * - **Each request says its urgency.** `"now"` is a person's own action (a
 *   replay button, a tapped word): it interrupts whatever is playing.
 *   `"next"` is speech the page started on its own (a lesson's next line):
 *   it waits its turn, and when a `"now"` line interrupts it the session
 *   plays it again afterwards, so the applet never hears of it.
 * - **Each line has one outcome**, and `say` resolves with it; it never
 *   rejects. A line is heard, or refused or cut off by mute, or interrupted
 *   by another `"now"` line (`"now"` lines are not replayed), or cancelled
 *   by this applet's own `stop` or signal, or failed, or the session ended.
 * - **A handle reaches only its own lines.** `stop` cancels this applet's
 *   lines, and no one else's.
 *
 * What is shared is only read: the person's mute, and who would speak a
 * language (`describe`), with `subscribe` to hear when either changes.
 *
 * Nor can a handle name a voice: the session owns what a person decides
 * about speech, which voice and whether it is muted. TOPIK once named "the
 * first Korean voice" on every line, so the voice chosen in Settings never
 * spoke a lesson.
 */

import type { SpeakOptions, VoiceReport } from "@speech/lib/adapters/types"
import type { SpokenLanguage } from "@speech/lib/language"

/** Whether a line interrupts what is playing, or waits its turn. */
export type Urgency = "now" | "next"

export type SayOptions = Pick<
  SpeakOptions,
  "signal" | "onStart" | "onBoundary" | "volume" | "playbackRate"
> & {
  /** The text's language. The session picks the voice for it. */
  language: SpokenLanguage
  /** Defaults to `"next"`. */
  urgency?: Urgency
  /**
   * A `"next"` line was interrupted by a `"now"` one, and will be said
   * again from the start once that has played: it is not playing
   * meanwhile. Its `onStart` fires again when it does.
   */
  onInterrupted?: () => void
}

/** What became of a line. */
export type SpeechOutcome =
  | { readonly kind: "heard" }
  /** Refused, or cut off, because the person muted voice output. */
  | { readonly kind: "muted" }
  /** A `"now"` line another `"now"` line interrupted. Not replayed. */
  | { readonly kind: "preempted" }
  /** This handle's own `stop`, or the line's signal. */
  | { readonly kind: "cancelled" }
  | { readonly kind: "failed"; readonly error: Error }
  /** The speech session ended before the line was heard. */
  | { readonly kind: "ended" }

export type Speaker = {
  /** False when nothing here can speak at all; muting does not change it. */
  readonly available: boolean
  /** Submits a line; resolves with its outcome. Never rejects. */
  say: (text: string, options: SayOptions) => Promise<SpeechOutcome>
  /** Cancels this handle's lines, playing or waiting. No one else's. */
  stop: () => void
  /**
   * Who would speak a line in `language`: the platform, the voice by name,
   * and whether it has one. For showing a person; an applet cannot choose.
   */
  describe: (language: SpokenLanguage) => VoiceReport
  /** Whether the person has muted voice output; lines are refused meanwhile. */
  readonly muted: boolean
  /**
   * Calls `listener` when `muted` or `describe` may have changed. Returns
   * the unsubscribe. A caller holding a line back while muted replays it
   * from here, and a display of `describe` refreshes from here.
   */
  subscribe: (listener: () => void) => () => void
}
