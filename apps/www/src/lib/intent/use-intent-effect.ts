/**
 * The navigate-on-success shape #943/S3 asks for explicitly: `void
 * navigate(...)` inside a render-phase `succeeded` arm of `matchIntent` is a
 * side effect during render, the same class of bug React's strict mode
 * exists to catch. `session-composer.tsx`'s current `onSuccess: (session) =>
 * navigate(...)` callbacks are exactly this effect, just run from inside
 * TanStack's own success callback instead of from render - #936 needs this
 * six-plus times when it migrates them.
 *
 * `useIntentEffect` fires `onSucceeded` from a real `useEffect`, and exactly
 * once per *new* terminal transition rather than once per render while the
 * intent happens to still read `succeeded` - `useIntent` builds a fresh
 * `Intent` object every render, so identity-comparing `intent` itself would
 * fire on every render; this compares the carried `value` instead, which
 * TanStack keeps referentially stable between renders until a new mutation
 * actually resolves.
 *
 * Deliberately implemented through `matchIntent` rather than reading
 * `intent.status` directly - the eliminator has to be sufficient for this
 * use case too, not just for rendering.
 */

import { useEffect, useRef } from "react"
import type { Intent } from "@some-ui/intent-kit"
import { matchIntent } from "@some-ui/intent-kit"

const NOT_YET_SEEN: unique symbol = Symbol(
  "useIntentEffect: no success observed yet"
)

export function useIntentEffect<T, TStep extends string = never>(
  intent: Intent<T, TStep>,
  onSucceeded: (value: T) => void
): void {
  const lastValueRef = useRef<T | typeof NOT_YET_SEEN>(NOT_YET_SEEN)
  const onSucceededRef = useRef(onSucceeded)

  // A ref's `.current` may not be written during render (React 19 enforces
  // this) - kept current via its own effect instead, declared before the
  // one that reads it so it has already run by the time that one does:
  // React fires a component's effects in declaration order on every commit.
  useEffect(() => {
    onSucceededRef.current = onSucceeded
  })

  // No dependency array, deliberately: `intent` is a fresh object every
  // render (see this module's header), so it can't usefully gate the
  // effect - the ref comparison below is what makes this fire once per
  // transition instead of once per render.
  useEffect(() => {
    matchIntent(intent, {
      idle: () => undefined,
      working: () => undefined,
      failed: () => undefined,
      succeeded: (value) => {
        if (Object.is(lastValueRef.current, value)) return
        lastValueRef.current = value
        onSucceededRef.current(value)
      },
    })
  })
}
