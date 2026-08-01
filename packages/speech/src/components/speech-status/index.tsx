/**
 * @module components/speech-status
 *
 * The user-facing half of the speech session: one disclosure when speech
 * turns on, one warning if it breaks, one note when it comes back, and
 * nothing else ever.
 *
 * Three surfaces, in descending order of how much an app has to opt in:
 *
 * - `SpeechStatusAnnouncer` renders inside `SpeechProvider` automatically.
 *   It drives the app's `notify` sink if there is one, and always mirrors
 *   the latest notice into an `aria-live` region so the disclosure exists
 *   for assistive technology regardless.
 * - `useSpeechStatus` gives an applet the coarse status, for a component
 *   that wants to show its own indicator.
 * - `SpeechStatusBadge` is that indicator, for applets that would rather
 *   drop one in than build it.
 */

import type { JSX } from "react"
import { useEffect, useMemo, useRef } from "react"
import { useQueueStore } from "@speech/lib/hooks/use-queue-store"
import type { SpeechQueueState } from "@speech/lib/queue"
import type { SpeechNotifier, SpeechStatus } from "@speech/lib/status"
import {
  createSpeechAnnouncer,
  deriveSpeechStatus,
  describeStatus,
} from "@speech/lib/status"

import { useSpeechSession } from "../speech-provider"

const selectError = (state: SpeechQueueState): string | null => state.error

/**
 * The coarse, user-facing state of speech. Deliberately the whole of what a
 * consumer can learn: which voice, and whether it works. Anything finer -
 * the adapter, the endpoint, the error text - is this package's business.
 */
export function useSpeechStatus(
  options: { muted?: boolean } = {}
): SpeechStatus {
  const { adapter, manager } = useSpeechSession()
  const error = useQueueStore(manager.getStore(), selectError)
  const muted = options.muted ?? manager.isMuted()

  // Memoized so the identity only changes when the status actually does.
  // Consumers put this straight into effect dependencies, and a fresh
  // object every render would turn "on a transition" into "on every render"
  // for all of them.
  return useMemo(
    () => deriveSpeechStatus(adapter, { error }, { muted }),
    [adapter, error, muted]
  )
}

export type SpeechStatusAnnouncerProps = {
  notify?: SpeechNotifier
  /**
   * Passed down rather than read off the manager: the manager's mute flag
   * is not reactive, and this component must re-render when it flips so the
   * live region and the frozen announcer both see it.
   */
  muted?: boolean
}

export const SpeechStatusAnnouncer = ({
  notify,
  muted = false,
}: SpeechStatusAnnouncerProps): JSX.Element => {
  const status = useSpeechStatus({ muted })

  // One announcer per session. It holds "what this person has already been
  // told", which is exactly the state that must not reset on re-render -
  // and must not survive into the next session either.
  const announcerRef = useRef(createSpeechAnnouncer())
  const notifyRef = useRef(notify)
  useEffect(() => {
    notifyRef.current = notify
  }, [notify])

  // `status` changes identity only when it changes value, so this runs on
  // transitions. It would be correct either way: `observe` is idempotent
  // and returns a notice only for a transition it has not already
  // announced. The dedup lives in the machine, where it is property-tested,
  // never in a dependency array.
  useEffect(() => {
    const notice = announcerRef.current.observe(status)
    if (notice) notifyRef.current?.(notice)
  }, [status])

  return (
    <div
      // `polite`, not `assertive`: none of this is urgent enough to
      // interrupt what a screen reader is already saying.
      aria-live="polite"
      aria-atomic="true"
      data-speech-status={`${status.voice}:${status.health}`}
      style={{
        position: "absolute",
        width: 1,
        height: 1,
        margin: -1,
        padding: 0,
        overflow: "hidden",
        clip: "rect(0 0 0 0)",
        whiteSpace: "nowrap",
        border: 0,
      }}
    >
      {/* Rendered from status rather than from the notice stream: a live
          region re-announces when its text changes and stays silent when it
          doesn't, so it needs no memory of what was already said. */}
      {describeStatus(status)}
    </div>
  )
}

const BADGE_LABEL: Readonly<Record<SpeechStatus["health"], string>> = {
  ready: "Voice output on",
  faulted: "Voice output problem",
  unavailable: "Voice output unavailable",
}

const BADGE_VOICE_LABEL: Readonly<Record<SpeechStatus["voice"], string>> = {
  device: "using your device's voice",
  hosted: "using this site's voice service",
}

export type SpeechStatusBadgeProps = {
  className?: string
  /** Renders the label as well as the icon. Off by default. */
  showLabel?: boolean
}

/**
 * A standing indicator for applets where speech starting unprompted would
 * otherwise be a surprise. Unstyled beyond a `data-speech-health` attribute
 * and an optional `className`, so a consuming design system can own how it
 * looks without this package importing one.
 */
export const SpeechStatusBadge = ({
  className,
  showLabel = false,
}: SpeechStatusBadgeProps): JSX.Element => {
  const status = useSpeechStatus()
  const label = `${BADGE_LABEL[status.health]}, ${BADGE_VOICE_LABEL[status.voice]}`

  return (
    <span
      className={className}
      data-speech-health={status.health}
      data-speech-voice={status.voice}
      title={label}
      aria-label={label}
      role="status"
    >
      <span aria-hidden="true">{status.health === "ready" ? "🔊" : "🔇"}</span>
      {showLabel ? <span>{BADGE_LABEL[status.health]}</span> : null}
    </span>
  )
}
