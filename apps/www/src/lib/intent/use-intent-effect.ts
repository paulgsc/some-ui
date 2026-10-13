/**
 * Navigate-on-success without a side effect during render: `onSucceeded`
 * fires from a real `useEffect`, once per attempt that succeeds. It keys on
 * the intent's `attempt`, not the carried value (two deletes both succeed
 * with `undefined`) nor the `Intent` object (`useIntent` rebuilds it every
 * render). Implemented through `matchIntent`, so the eliminator suffices
 * here too.
 */

import { useEffect, useEffectEvent, useRef } from "react"
import type { Intent } from "@some-ui/intent-kit"
import { matchIntent } from "@some-ui/intent-kit"

export function useIntentEffect<T, TStep extends string = never>(
  intent: { readonly state: Intent<T, TStep>; readonly attempt: number },
  onSucceeded: (value: T) => void
): void {
  const handledAttemptRef = useRef<number | null>(null)
  const succeed = useEffectEvent(onSucceeded)
  const { state, attempt } = intent

  // No dependency array: see the header.
  useEffect(() => {
    matchIntent(state, {
      idle: () => undefined,
      working: () => undefined,
      failed: () => undefined,
      succeeded: (value) => {
        if (handledAttemptRef.current === attempt) return
        handledAttemptRef.current = attempt
        succeed(value)
      },
    })
  })
}
