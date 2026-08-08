/**
 * #944/S4: what each presentation mode *permits*. `@some-ui/intent-kit`
 * gains at most the `IntentPresentation` enum itself - everything about
 * what a mode allows a renderer to do lives here, in `apps/www`, because it
 * has an opinion about toasts and status surfaces that the shared package
 * must not have.
 *
 * ## The rule this whole story exists to state
 *
 * The exhaustive match is **always** required, in every mode. An ambient
 * intent still has four arms to fill in - what differs is the *content*
 * those arms are allowed to render, not whether they exist. `working: () =>
 * null` written deliberately, for an ambient intent, is a decision on the
 * record; a missing arm is not possible at all, by construction (see
 * `__type-fixtures__/ambient-still-exhaustive.fixtures.ts`). The trap named
 * in #944's own issue body: "ambient intents may render nothing" and
 * "intents may be silent" read as the same sentence, and #933's whole
 * thesis is that the second is forbidden. `failureMayBeSilent` below is
 * `false` in every mode for exactly this reason - it is not a per-mode
 * choice.
 *
 * ## Ambient surface: a status affordance, not a toast
 *
 * `apps/www` already has an editorial position on this, stated in two
 * places independently before this story existed:
 * `components/audio/audio-activity-notice.tsx`'s header ("Inline rather
 * than a toast, because a toast that teaches a feature is a toast that
 * gets missed") and `providers/tts.tsx`'s ("A toast on initial mount
 * is..."). The same reasoning applies to ambient failures: a transient
 * toast for something the person never asked for and may not be looking at
 * is a toast they can miss entirely, with no way to check later whether it
 * fired. The recommendation is a persistent, low-prominence status
 * surface (a dot, a small inline note near the feature) that stays until
 * acknowledged or resolved, rather than `sonner`'s existing toast queue
 * (mounted once in `providers/index.tsx`, and exactly right for
 * `interactive` failures, which *are* something the person is waiting on).
 * Building that surface is not this story - see the epic's non-goals - this
 * is the recommendation the surface should follow when #936 builds it.
 *
 * ## Advisory, not enforced
 *
 * `useIntent`'s `presentation` option is read by whatever renders `state`;
 * nothing in the type system stops an `interactive`-shaped renderer from
 * receiving an `ambient` intent. Enforcing that would mean encoding "this
 * component may only render ambient intents" in the type system - a real
 * investment, and one this app's single-renderer-population doesn't yet
 * justify (the same Doctrine reasoning `@some-ui/intent-kit`'s own
 * package-shape test exists to keep honest). If #936 finds the advisory
 * version actually leaking - an interactive failure rendered as a quiet
 * status dot nobody notices - that is the signal to revisit this decision,
 * not a reason to have preempted it here.
 *
 * ## The autosave verdict
 *
 * #934's census found one producer a two-way split can't express honestly:
 * the debounced layout autosave. Not interactive (the person didn't ask for
 * it, so interrupting is wrong) and not safely `ambient` either (a silent
 * failure loses arrangement work they just authored, which plain `ambient`
 * permits). `"ambient-durable"` (defined in `@some-ui/intent-kit`) is the
 * third value: progress may still be quiet
 * (`mayInterruptOnFailure: false`), but the failure has to survive the
 * person navigating away - `failureMustSurviveNavigation: true` is this
 * policy's answer, and is true for no other mode.
 */

import type { IntentPresentation } from "@some-ui/intent-kit"

export type PresentationPolicy = {
  /** May a `failed` arm interrupt the person (a modal, a toast that steals
   * focus), or must it resolve to something passive and glanceable? */
  readonly mayInterruptOnFailure: boolean
  /** Must a `retryable` failure show a retry control at or near the
   * control that started the intent? Never required for a mode that may
   * not interrupt in the first place - there is no "near the control" for
   * an intent nobody clicked. */
  readonly requiresVisibleRetryAffordance: boolean
  /** Always `false`. Not a per-mode choice - see this module's header. A
   * `failed` arm may render quietly; it may never render nothing. */
  readonly failureMayBeSilent: false
  /** Must a failure be recorded somewhere that survives the person
   * navigating away from whatever triggered it? True only for
   * `ambient-durable` - see the autosave verdict above. */
  readonly failureMustSurviveNavigation: boolean
}

function assertNever(_mode: never): never {
  throw new Error("unhandled IntentPresentation")
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
