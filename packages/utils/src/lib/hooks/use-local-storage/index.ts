// Modifications by [pgdev] (Year)
// // Based on code from Julien CARON's work (https://github.com/JulienCaron/local-storage-react-hook), licensed under the MIT License.
// // See LICENSE file for full text.
//

import { useCallback, useState } from "react"
import type { Dispatch, SetStateAction } from "react"
import { useEventCallback, useEventListener } from "usehooks-ts"

declare global {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface WindowEventMap {
    "local-storage": CustomEvent
  }
}

/**
 * Options for customizing the behavior of serialization and deserialization.
 * @template T - The type of the state to be stored in local storage.
 */
type UseLocalStorageOptions<T> = {
  /** A function to serialize the value before storing it. */
  serializer?: (value: T) => string
  /** A function to deserialize the stored value. */
  deserializer?: (value: string) => T
  /**
   * If `true` (default), the hook will initialize reading the local storage. In SSR, you should set it to `false`, returning the initial value initially.
   * @default true
   */
  initializeWithValue?: boolean
}

const IS_SERVER = typeof window === "undefined"

/**
 * Custom hook that uses the [`localStorage API`](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage) to persist state across page reloads.
 * @template T - The type of the state to be stored in local storage.
 * @param {string} key - The key under which the value will be stored in local storage.
 * @param {T | (() => T)} initialValue - The initial value of the state or a function that returns the initial value.
 * @param {UseLocalStorageOptions<T>} [options] - Options for customizing the behavior of serialization and deserialization (optional).
 * @returns {[T, Dispatch<SetStateAction<T>>, () => void]} A tuple containing the stored value, a function to set the value and a function to remove the key from storage.
 * @public
 * @see [Documentation](https://usehooks-ts.com/react-hook/use-local-storage)
 * @example
 * ```tsx
 * const [count, setCount, removeCount] = useLocalStorage('count', 0);
 * // Access the `count` value, the `setCount` function to update it and `removeCount` function to remove the key from storage.
 * ```
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T | (() => T),
  options: UseLocalStorageOptions<T> = {}
): {
  value: T
  setValue: Dispatch<SetStateAction<T>>
  removeValue: () => void
} {
  const { initializeWithValue = true } = options

  const serializer = useCallback<(value: T) => string>(
    (value) => {
      if (options.serializer) {
        return options.serializer(value)
      }

      return JSON.stringify(value)
    },
    [options]
  )

  const deserializer = useCallback<(value: string) => T>(
    (value) => {
      if (options.deserializer) {
        return options.deserializer(value)
      }
      // Support 'undefined' as a value. `T` need not include `undefined`,
      // so this is a deliberate hole rather than an oversight: a caller that
      // stored `undefined` gets it back, and one that never stores it never
      // reaches this branch.
      if (value === "undefined") {
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see above
        return undefined as T
      }

      const defaultValue =
        initialValue instanceof Function ? initialValue() : initialValue

      let parsed: unknown
      try {
        parsed = JSON.parse(value)
      } catch {
        return defaultValue // Return initialValue if parsing fails
      }

      // JSON.parse hands back `unknown`, and what is in localStorage was put
      // there by a previous version of this app. The assertion is the trust
      // boundary; a caller that needs it checked passes a `deserializer`.
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see above
      return parsed as T
    },
    [options, initialValue]
  )

  // Get from local storage then
  // parse stored json or return initialValue
  const readValue = useCallback((): T => {
    const initialValueToUse =
      initialValue instanceof Function ? initialValue() : initialValue

    // Prevent build error "window is undefined" but keep working
    if (IS_SERVER) {
      return initialValueToUse
    }

    try {
      const raw = window.localStorage.getItem(key)
      return raw ? deserializer(raw) : initialValueToUse
    } catch {
      return initialValueToUse
    }
  }, [initialValue, key, deserializer])

  const [storedValue, setStoredValue] = useState(() => {
    if (initializeWithValue) {
      return readValue()
    }

    return initialValue instanceof Function ? initialValue() : initialValue
  })

  // Return a wrapped version of useState's setter function that ...
  // ... persists the new value to localStorage.
  const setValue: Dispatch<SetStateAction<T>> = useEventCallback((value) => {
    // Prevent build error "window is undefined" but keeps working

    try {
      // Allow value to be a function so we have the same API as useState
      const newValue = value instanceof Function ? value(readValue()) : value

      // Save to local storage
      window.localStorage.setItem(key, serializer(newValue))

      // Save state
      setStoredValue(newValue)

      // We dispatch a custom event so every similar useLocalStorage hook is notified
      window.dispatchEvent(new StorageEvent("local-storage", { key }))
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn(`Error setting localStorage key “${key}”:`, error)
    }
  })

  const removeValue = useEventCallback(() => {
    // Prevent build error "window is undefined" but keeps working
    if (IS_SERVER) {
      // eslint-disable-next-line no-console
      console.warn(
        `Tried removing localStorage key “${key}” even though environment is not a client`
      )
    }

    const defaultValue =
      initialValue instanceof Function ? initialValue() : initialValue

    // Remove the key from local storage
    window.localStorage.removeItem(key)

    // Save state with default value
    setStoredValue(defaultValue)

    // We dispatch a custom event so every similar useLocalStorage hook is notified
    window.dispatchEvent(new StorageEvent("local-storage", { key }))
  })

  // A different key is a different value, and it has to be the new one on the
  // very first render under that key - not one frame later. Adjusting state
  // during render is React's own shape for this (the same one `useFittedPage`
  // uses in this package): React discards this render and immediately
  // re-renders, so no frame ever paints the previous key's value, and there
  // is no effect to cascade.
  const [readKey, setReadKey] = useState(key)
  if (readKey !== key) {
    setReadKey(key)
    setStoredValue(readValue())
  }

  const handleStorageChange = useCallback(
    (event: StorageEvent | CustomEvent) => {
      // Narrowed rather than asserted: the custom "local-storage" event is a
      // CustomEvent with no `key` at all, and reading one off it used to
      // depend on the assertion producing `undefined`. Same outcome - a
      // keyless event is for every subscriber - said out loud.
      if (
        event instanceof StorageEvent &&
        event.key !== null &&
        event.key !== key
      ) {
        return
      }
      setStoredValue(readValue())
    },
    [key, readValue]
  )

  // this only works for other documents, not the current one
  useEventListener("storage", handleStorageChange)

  // this is a custom event, triggered in writeValueToLocalStorage
  // See: useLocalStorage()
  useEventListener("local-storage", handleStorageChange)

  return { value: storedValue, setValue, removeValue }
}
