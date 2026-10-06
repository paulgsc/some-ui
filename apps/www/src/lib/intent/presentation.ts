/**
 * What each presentation mode *permits*. `@some-ui/intent-kit` holds only the
 * `IntentPresentation` enum; opinions about toasts and status surfaces live
 * here, in the app.
 *
 * The exhaustive match is **always** required, in every mode: modes differ in
 * what the arms may render, not whether they exist
 * (`__type-fixtures__/ambient-still-exhaustive.fixtures.ts`). "Ambient intents
 * may render nothing" is not "intents may be silent", so
 * `failureMayBeSilent` is `false` in every mode.
 *
 * Ambient failures belong on a persistent, low-prominence status surface, not
 * a toast the person may never see (the same reasoning as
 * `audio-activity-notice.tsx` and `providers/tts.tsx`). The `sonner` queue is
 * right for `interactive` failures, which the person is waiting on.
 *
 * Advisory, not enforced: nothing in the type system stops an
 * `interactive`-shaped renderer receiving an `ambient` intent. Revisit if one
 * leaks.
 *
 * `"ambient-durable"` is for the debounced layout autosave: not interactive
 * (nobody asked, so no interruption), but a silent failure would lose
 * authored work, so the failure must survive navigation
 * (`failureMustSurviveNavigation`, true for no other mode).
 */

import { assertNever } from "@some-ui/intent-kit"
import type { IntentPresentation } from "@some-ui/intent-kit"

export type PresentationPolicy = {
  /** May a `failed` arm interrupt the person (a modal, a toast that steals
   * focus), or must it resolve to something passive and glanceable? */
  readonly mayInterruptOnFailure: boolean
  /** Must a `retryable` failure show a retry control near the control that
   * started it? Never for a mode that may not interrupt: nobody clicked. */
  readonly requiresVisibleRetryAffordance: boolean
  /** Always `false` (see header): a `failed` arm may render quietly, never
   * render nothing. */
  readonly failureMayBeSilent: false
  /** Must a failure be recorded somewhere that survives navigating away?
   * True only for `ambient-durable`. */
  readonly failureMustSurviveNavigation: boolean
}

export function presentationPolicyFor(
  mode: IntentPresentation
): PresentationPolicy {
  switch (mode) {
    case "interactive": {
      return {
        mayInterruptOnFailure: true,
        requiresVisibleRetryAffordance: true,
        failureMayBeSilent: false,
        failureMustSurviveNavigation: false,
      }
    }
    case "ambient": {
      return {
        mayInterruptOnFailure: false,
        requiresVisibleRetryAffordance: false,
        failureMayBeSilent: false,
        failureMustSurviveNavigation: false,
      }
    }
    case "ambient-durable": {
      return {
        mayInterruptOnFailure: false,
        requiresVisibleRetryAffordance: false,
        failureMayBeSilent: false,
        failureMustSurviveNavigation: true,
      }
    }
    default: {
      return assertNever(mode)
    }
  }
}
