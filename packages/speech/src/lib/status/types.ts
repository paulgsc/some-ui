/**
 * @module status/types
 *
 * The user-facing vocabulary for speech, and the only speech vocabulary
 * that is allowed to reach a person.
 *
 * Everything else in this package is machinery: adapters, ledgers, abort
 * signals, a synthesizer's voice list. None of that is a user's problem,
 * and none of it belongs in a toast. But *something* does: a page that
 * starts talking is a surprise, and a page that has silently stopped being
 * able to talk is worse - the applet looks fine and simply never speaks
 * again.
 *
 * So this module defines one coarse fact and nothing more: **whether it is
 * working** - ready, faulted, or unavailable - and whether the person muted
 * it. Every voice is the device's own (the browser's or the phone's), so
 * which voice speaks is not a fact worth a notice; `VoiceReport` names it
 * where a person looks for it.
 */

/**
 * - `"ready"` - speech works.
 * - `"faulted"` - something that was asked for could not be spoken. The
 *   session is still live and the next utterance may well succeed.
 * - `"unavailable"` - this runtime cannot speak at all.
 */
export type SpeechHealth = "ready" | "faulted" | "unavailable"

export type SpeechStatus = {
  readonly health: SpeechHealth
  /**
   * The person has turned voice output off. Distinct from `unavailable` on
   * purpose: one is a choice they made and can undo, the other is a fact
   * about the runtime. Conflating them is how apps end up telling someone
   * their browser is broken when they simply muted it.
   */
  readonly muted: boolean
}

export type SpeechNoticeKind =
  | "activated"
  | "faulted"
  | "recovered"
  | "unavailable"

export type SpeechNoticeTone = "info" | "warning"

/**
 * One thing worth telling a person, once.
 *
 * `title` and `description` are plain prose with no identifiers, hostnames,
 * error strings or counts in them - a notice is a disclosure, not a log
 * line. The underlying error text stays where it is useful: in the queue
 * state a developer can read.
 */
export type SpeechNotice = {
  readonly kind: SpeechNoticeKind
  readonly tone: SpeechNoticeTone
  readonly title: string
  readonly description: string
}

/**
 * Where notices go. Supplied by the app, because the app owns its toaster:
 * `apps/www` mounts exactly one `<Toaster />` (sonner) and a library that
 * rendered its own would stack a second one beside it, with its own
 * placement, theme and stacking order. This package decides *what* is worth
 * saying and *when* - which is the part that must not be re-derived per
 * applet - and hands the rendering to whoever already owns it.
 *
 * Omitting it is fine and silent by design: the provider still announces
 * every notice through an `aria-live` region, so the disclosure exists for
 * assistive technology whether or not an app wires a toaster up.
 */
export type SpeechNotifier = (notice: SpeechNotice) => void
