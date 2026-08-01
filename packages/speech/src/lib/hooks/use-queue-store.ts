import { useCallback, useRef, useSyncExternalStore } from "react"
import type { SpeechAction, SpeechQueueState, Store } from "@speech/lib/queue"

type QueueStore = Store<SpeechQueueState, SpeechAction>

/**
 * Subscribes to a slice of the queue store.
 *
 * The snapshot is memoized on the state object's identity (the reducer
 * always returns a fresh object when anything changed, and the same one
 * when nothing did). Without that, a selector that builds an object -
 * `state => ({ isActive, queueSize })` - hands `useSyncExternalStore` a new
 * reference on every call and React re-renders forever.
 */
export function useQueueStore<S>(
  store: QueueStore,
  selector: (state: SpeechQueueState) => S
): S {
  const cache = useRef<{
    state: SpeechQueueState
    selector: (state: SpeechQueueState) => S
    value: S
  } | null>(null)

  const getSnapshot = useCallback((): S => {
    const state = store.get()
    const cached = cache.current
    if (cached?.state === state && cached.selector === selector) {
      return cached.value
    }
    const value = selector(state)
    cache.current = { state, selector, value }
    return value
  }, [store, selector])

  const subscribe = useCallback(
    (onChange: () => void) => store.subscribe(selector, onChange),
    [store, selector]
  )

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
