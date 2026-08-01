/**
 * @module status
 *
 * Turns a stream of speech state into at most a handful of notices.
 *
 * The requirement this exists to satisfy is legibility *without* noise. A
 * failing backend does not fail once - it fails for every utterance the
 * queue retries, and an applet that speaks per chat message can generate
 * dozens of failures a minute. One toast per failure is worse than none:
 * it buries the page, and the second toast tells a person nothing the first
 * one didn't.
 *
 * So the rule is a state machine, not a subscription. Notices are emitted
 * on **transitions between announced states**, never on events:
 *
 * - The same status repeated any number of times emits nothing after the
 *   first (idempotent).
 * - N consecutive failures are one `"faulted"` notice (atomic - the episode
 *   is the unit, not the error).
 * - Recovery emits exactly one `"recovered"`, and only if a fault was
 *   actually announced.
 * - No two consecutive notices are ever identical. (The one same-kind
 *   repeat allowed is a re-disclosure when the voice itself changes, since
 *   what is sent where has just changed with it.)
 *
 * Those four sentences are the property tests in `index.test.ts`, checked
 * against arbitrary status sequences rather than hand-picked ones - the
 * failure mode here is precisely the interleaving nobody thought of.
 */

import type { SpeechQueueState } from "@speech/lib/queue"

import type { SpeechAdapter } from "../adapters/types"
import type {
  SpeechHealth,
  SpeechNotice,
  SpeechNoticeKind,
  SpeechStatus,
  SpeechVoiceKind,
} from "./types"

export type {
  SpeechHealth,
  SpeechNotice,
  SpeechNoticeKind,
  SpeechNoticeTone,
  SpeechNotifier,
  SpeechStatus,
  SpeechVoiceKind,
} from "./types"

/**
 * The browser's own synthesizer is the only backend that never sends text
 * anywhere; everything else this package can resolve to is, from a person's
 * point of view, "a service somewhere else".
 */
export function voiceKindOf(adapter: SpeechAdapter): SpeechVoiceKind {
  return adapter.id === "web-speech" ? "device" : "hosted"
}

export function healthOf(
  adapter: SpeechAdapter,
  queue: Pick<SpeechQueueState, "error">
): SpeechHealth {
  if (!adapter.supported) return "unavailable"
  // The queue holds `error` from the failure that set it until an utterance
  // actually completes - so this is "the last thing that finished, failed",
  // which is the episode boundary a person cares about. Deriving it from
  // anything that changes when an utterance *starts* produces a
  // ready/faulted flicker on every retry; see the reducer's ITEM_STARTED.
  return queue.error === null ? "ready" : "faulted"
}

export function deriveSpeechStatus(
  adapter: SpeechAdapter,
  queue: Pick<SpeechQueueState, "error">,
  options: { muted?: boolean } = {}
): SpeechStatus {
  return {
    voice: voiceKindOf(adapter),
    health: healthOf(adapter, queue),
    muted: options.muted ?? false,
  }
}

// ── Copy ───────────────────────────────────────────────────────────────────
//
// Plain prose, no identifiers. A person reading these should learn what is
// happening to them and what it costs them, and nothing about how it works.

const ACTIVATION_DESCRIPTION: Readonly<Record<SpeechVoiceKind, string>> = {
  device:
    "This page can read text aloud. It uses the voice built into your device, so nothing you hear is sent anywhere.",
  hosted:
    "This page can read text aloud. Text to be spoken is sent to this site's voice service.",
}

function noticeFor(
  kind: SpeechNoticeKind,
  voice: SpeechVoiceKind
): SpeechNotice {
  switch (kind) {
    case "activated": {
      return {
        kind,
        tone: "info",
        title: "Voice output is on",
        description: ACTIVATION_DESCRIPTION[voice],
      }
    }
    case "faulted": {
      return {
        kind,
        tone: "warning",
        title: "Voice output stopped working",
        description:
          "Something could not be read aloud. Everything else on the page still works, and speech may recover on its own.",
      }
    }
    case "recovered": {
      return {
        kind,
        tone: "info",
        title: "Voice output is working again",
        description: "Text is being read aloud again.",
      }
    }
    case "unavailable": {
      return {
        kind,
        tone: "warning",
        title: "Voice output is unavailable",
        description:
          "This browser can't read text aloud. Nothing else on the page is affected.",
      }
    }
    default: {
      return assertNever(kind)
    }
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled speech notice kind: ${JSON.stringify(value)}`)
}

/**
 * The current state of speech in one sentence, for an `aria-live` region.
 *
 * A live region wants *state*, not events: it re-announces whenever its text
 * changes and stays silent when it doesn't, which gives the same dedup the
 * notice machine gives a toaster - without needing any memory of its own.
 */
export function describeStatus(status: SpeechStatus): string {
  if (status.muted) {
    return "Voice output is off. Nothing on this page will be read aloud until you turn it back on."
  }
  const notice = noticeFor(
    status.health === "ready"
      ? "activated"
      : status.health === "faulted"
        ? "faulted"
        : "unavailable",
    status.voice
  )
  return `${notice.title}. ${notice.description}`
}

// ── The machine ────────────────────────────────────────────────────────────

/**
 * What has already been said. Kept outside the status so that "the state of
 * speech" and "what this person has already been told about it" stay
 * separate concerns - the whole dedup rule lives in the gap between them.
 */
export type AnnouncerState = {
  readonly announced: SpeechNoticeKind | null
  readonly voice: SpeechVoiceKind | null
}

export const INITIAL_ANNOUNCER_STATE: AnnouncerState = {
  announced: null,
  voice: null,
}

export type AnnouncerStep = {
  readonly state: AnnouncerState
  /** The one thing worth saying about this transition, if anything is. */
  readonly notice: SpeechNotice | null
}

/**
 * Advances the announcer by one observed status.
 *
 * Pure and total: same inputs, same output, no clock, no I/O. That is what
 * makes "N failures produce one notice" a property that can be checked
 * rather than a behaviour that has to be trusted.
 */
export function announce(
  state: AnnouncerState,
  status: SpeechStatus
): AnnouncerStep {
  const emit = (kind: SpeechNoticeKind): AnnouncerStep => ({
    state: { announced: kind, voice: status.voice },
    notice: noticeFor(kind, status.voice),
  })
  const silent = (): AnnouncerStep => ({
    state: { ...state, voice: status.voice },
    notice: null,
  })

  /**
   * A changed voice is a changed data-handling story - text that stayed on
   * the device may now be leaving it - so it earns a fresh disclosure. It
   * only does so from the `ready` arm, though: "speech is broken" and
   * "speech is unavailable" are the same fact to a person whichever backend
   * was going to have spoken, and re-announcing them on a voice change is
   * the noise this machine exists to prevent. (A property test found that
   * one: `unavailable` for one voice followed by `unavailable` for another
   * produced two identical warnings in a row.)
   */
  const voiceChanged = state.voice !== null && state.voice !== status.voice

  /*
   * Muting is something a person did, not something that happened to them.
   * The indicator they just clicked already says so, and a toast confirming
   * their own click is the definition of noise - so the machine goes quiet
   * and freezes rather than announcing. Unmuting resumes from exactly the
   * state it left: if the session was never announced, unmuting discloses
   * it then, which is the right moment anyway.
   */
  if (status.muted) return silent()

  switch (status.health) {
    case "unavailable": {
      return state.announced === "unavailable" ? silent() : emit("unavailable")
    }
    case "faulted": {
      // The episode is the unit: once a fault is announced, every further
      // failure in the same episode is the same fact restated.
      return state.announced === "faulted" ? silent() : emit("faulted")
    }
    case "ready": {
      if (state.announced === null) return emit("activated")
      // Only a fault that was actually announced earns a recovery notice -
      // otherwise "it's working again" arrives with no "it broke" before it.
      if (state.announced === "faulted") return emit("recovered")
      // A voice change means a new session with a different backend, which
      // is a fresh disclosure: what is sent where has just changed.
      if (voiceChanged) return emit("activated")
      return silent()
    }
    default: {
      return assertNever(status.health)
    }
  }
}

/**
 * A stateful wrapper for the effectful side - one per session, held by the
 * provider. `observe` is safe to call on every render or every store update;
 * that is the whole point of the machine underneath it.
 */
export type SpeechAnnouncer = {
  observe: (status: SpeechStatus) => SpeechNotice | null
  /** The last notice emitted, for the `aria-live` region to mirror. */
  readonly current: SpeechNotice | null
}

export function createSpeechAnnouncer(): SpeechAnnouncer {
  let state = INITIAL_ANNOUNCER_STATE
  let current: SpeechNotice | null = null

  return {
    observe: (status: SpeechStatus): SpeechNotice | null => {
      const step = announce(state, status)
      state = step.state
      if (step.notice) current = step.notice
      return step.notice
    },
    get current(): SpeechNotice | null {
      return current
    },
  }
}
