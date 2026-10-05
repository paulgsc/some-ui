/**
 * An ambient intent still requires all four arms: the property most likely to
 * be "simplified away" by a reader who concludes ambient means optional.
 * `presentation` sits beside `state` on `UseIntentResult`, never inside
 * `Intent`, so it cannot relax `matchIntent`; the missing-arm
 * `@ts-expect-error` below proves it. Checked by `tsc --noEmit`, not vitest:
 * an unused directive is the failure (see `@some-ui/intent-kit`'s fixtures).
 */

import { matchIntent } from "@some-ui/intent-kit"

import type { UseIntentResult } from "@/lib/intent/use-intent"

// A type-only stand-in for `useIntent(mutation, { presentation: "ambient" })`
// (a hook cannot be called here).
declare const ambientIntent: UseIntentResult<string, string> & {
  readonly presentation: "ambient"
}

// "Ambient" describes what an arm may render, never whether it must exist.
// @ts-expect-error - missing the required `failed` arm, ambient or not
const missingArm = matchIntent(ambientIntent.state, {
  idle: () => null,
  working: () => null,
  succeeded: () => null,
})
void missingArm

// A deliberately quiet `failed` arm is fine: only the arm's presence is
// required.
const wellFormedQuiet = matchIntent(ambientIntent.state, {
  idle: () => null,
  working: () => null,
  succeeded: () => null,
  // `null` is a legitimate ambient "renders nothing visually"
  // (presentation.ts), distinct from not handling the arm.
  failed: () => null,
})
void wellFormedQuiet
