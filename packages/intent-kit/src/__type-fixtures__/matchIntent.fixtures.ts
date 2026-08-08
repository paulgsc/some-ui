/**
 * Type-level proof that `matchIntent`'s exhaustiveness is a compiler
 * guarantee, not a convention. Every `@ts-expect-error` below has to be
 * lying about a real error one line down, or TypeScript's own
 * "unused '@ts-expect-error' directive" diagnostic turns red — which is
 * exactly the mechanism S1's acceptance criterion asks for: weaken
 * `IntentArms` (make an arm optional, add a `default`) and the fixture that
 * exercises it stops erroring, and its directive itself becomes the
 * failure.
 *
 * Not a `*.test.ts` - it must be part of the ordinary `tsc --noEmit` run
 * (excluded from the build via tsconfig.build.json), not something that
 * only runs under vitest. Nothing here executes; `void` on every binding
 * exists only to satisfy `noUnusedLocals`.
 */

import { failed, idle, matchIntent } from "../intent"
import type { Intent } from "../intent"
import { toIntentError } from "../intent-error"

const anIntent: Intent<number> = idle()

// Missing arm: `failed` is required by `IntentArms`.
// @ts-expect-error - missing the required `failed` arm
const missingArm = matchIntent(anIntent, {
  idle: () => null,
  working: () => null,
  succeeded: () => null,
})
void missingArm

// Extra arm: `cancelled` isn't part of the sealed vocabulary - see intent.ts's
// header for why there is no fifth state to handle. The excess-property
// error TypeScript reports is anchored on the offending property itself,
// not the call - the directive has to sit immediately above that line.
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
