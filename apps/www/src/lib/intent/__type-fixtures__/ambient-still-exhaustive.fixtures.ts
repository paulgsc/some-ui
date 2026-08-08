/**
 * #944/S4's own acceptance criterion: "An ambient intent still requires all
 * four arms. Verified by a fixture, because this is the property most
 * likely to be 'simplified away' by a future reader who reasonably
 * concludes that ambient means optional."
 *
 * There is nothing presentation-specific in `matchIntent`'s signature -
 * `presentation` lives alongside `state` on `UseIntentResult`, never inside
 * `Intent` itself (see `use-intent.ts`), so there is no way for it to relax
 * the eliminator. This file proves that by construction rather than by
 * assertion: the same missing-arm `@ts-expect-error` that
 * `@some-ui/intent-kit`'s own fixtures exercise, repeated here against an
 * intent explicitly obtained through an `ambient`-presentation `useIntent`
 * call.
 *
 * Not a `*.test.ts` - part of the ordinary `tsc --noEmit` run, not vitest;
 * see `@some-ui/intent-kit`'s own fixture file for the same convention and
 * why "unused '@ts-expect-error' directive" is the actual enforcement
 * mechanism.
 */

import { matchIntent } from "@some-ui/intent-kit"

import type { UseIntentResult } from "../use-intent"

// A type-only stand-in for what `useIntent(mutation, { presentation:
// "ambient" })` returns - calling the real hook is unavailable here (it is
// a React Hook, and this file is not a component or a custom hook), and
// the type is all this fixture needs: proof that `ambientIntent.state`'s
// shape is exactly `Intent<T>`, with no presentation-conditional relaxation
// of `matchIntent`'s required arms.
declare const ambientIntent: UseIntentResult<string, string> & {
  readonly presentation: "ambient"
}

// Missing the `failed` arm - still a compile error for an ambient-presentation
// intent, exactly as it is for an interactive one. "Ambient" describes what
// the arm is allowed to *render*, never whether it has to exist.
// @ts-expect-error - missing the required `failed` arm, ambient or not
const missingArm = matchIntent(ambientIntent.state, {
  idle: () => null,
  working: () => null,
  succeeded: () => null,
})
void missingArm

// Sanity: a deliberately-quiet `failed` arm (`() => null`) is fine - the
// content is the author's choice, only the arm's presence is not.
const wellFormedQuiet = matchIntent(ambientIntent.state, {
  idle: () => null,
  working: () => null,
  succeeded: () => null,
  // A real ambient renderer would still decide something here (log it, set
  // a status flag) - `null` stands in for "renders nothing visually",
  // which is a legitimate ambient choice per presentation.ts's policy,
  // distinct from not handling the arm at all.
  failed: () => null,
})
void wellFormedQuiet
