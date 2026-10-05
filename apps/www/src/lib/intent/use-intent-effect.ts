/**
 * Navigate-on-success without a side effect during render: `onSucceeded`
 * fires from a real `useEffect`, once per *new* terminal transition. It
 * compares the carried `value` (stable until a new mutation resolves), not
 * the `Intent` object, which `useIntent` rebuilds every render. Implemented
 * through `matchIntent`, so the eliminator suffices here too.
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

  // A ref may not be written during render (React 19), so it is kept current
  // by its own effect, declared first: effects run in declaration order.
  useEffect(() => {
    onSucceededRef.current = onSucceeded
  })

  // No dependency array: `intent` is a fresh object every render; the ref
  // comparison makes this fire once per transition.
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
