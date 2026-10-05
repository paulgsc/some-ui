/**
 * Type-level proof that `matchIntent`'s exhaustiveness is a compiler
 * guarantee: weaken `IntentArms` and a fixture below stops erroring, so its
 * `@ts-expect-error` is reported as unused. Checked by `tsc --noEmit`
 * (excluded from the build), not vitest; `void` satisfies `noUnusedLocals`.
 */

import { failed, idle, matchIntent } from "@intent-kit/intent"
import type { Intent } from "@intent-kit/intent"
import { toIntentError } from "@intent-kit/intent-error"

const anIntent: Intent<number> = idle()

// Missing arm: `failed` is required by `IntentArms`.
// @ts-expect-error - missing the required `failed` arm
const missingArm = matchIntent(anIntent, {
  idle: () => null,
  working: () => null,
  succeeded: () => null,
})
void missingArm

// Extra arm: `cancelled` isn't in the sealed vocabulary. The excess-property
// error is anchored on the property, so the directive sits above it.

const extraArm = matchIntent(anIntent, {
  idle: () => null,
  working: () => null,
  succeeded: () => null,
  failed: () => null,
  // @ts-expect-error - `cancelled` is not a key of IntentArms
  cancelled: () => null,
})
void extraArm

// Reading a field off an unnarrowed union: `.value` only exists on the
// `succeeded` member, and there is no `.status` switch exposed to narrow it
// with outside of `matchIntent` itself.
// @ts-expect-error - `.value` does not exist on every member of Intent<number>
const unnarrowedValue = anIntent.value
void unnarrowedValue

// Constructing `failed` without a retry: a failed intent with nothing to
// retry is the dead-button defect this whole vocabulary exists to prevent.
// @ts-expect-error - `failed` requires a `retry` callback
const noRetry = failed(toIntentError(new Error("boom")))
void noRetry

// Sanity: the well-formed call compiles with no errors, so the fixtures
// above are proven against real code, not a typo.
const wellFormed = matchIntent(anIntent, {
  idle: () => 0,
  working: () => 0,
  succeeded: (value) => value,
  failed: () => 0,
})
void wellFormed
