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

type UseLocalStorageOptions<T> = {
  serializer?: (value: T) => string
  deserializer?: (value: string) => T
  /** Read storage on first render (default). Set `false` under SSR. */
  initializeWithValue?: boolean
}

const IS_SERVER = typeof window === "undefined"

/**
 * State persisted to `localStorage` under `key`, kept in sync across hooks in
 * this document and storage events from others.
 * @see https://usehooks-ts.com/react-hook/use-local-storage
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
      // A deliberate hole: `T` need not include `undefined`, but a caller
      // that stored `undefined` gets it back.
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
        return defaultValue
      }

      // The trust boundary: storage was written by a previous version of this
      // app. A caller that needs it checked passes a `deserializer`.
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see above
      return parsed as T
    },
    [options, initialValue]
  )

  const readValue = useCallback((): T => {
    const initialValueToUse =
      initialValue instanceof Function ? initialValue() : initialValue

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

  const setValue: Dispatch<SetStateAction<T>> = useEventCallback((value) => {
    try {
      const newValue = value instanceof Function ? value(readValue()) : value
      window.localStorage.setItem(key, serializer(newValue))
      setStoredValue(newValue)
      // Notifies every useLocalStorage hook in this document.
      window.dispatchEvent(new StorageEvent("local-storage", { key }))
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn(`Error setting localStorage key “${key}”:`, error)
    }
  })

  const removeValue = useEventCallback(() => {
    if (IS_SERVER) {
      // eslint-disable-next-line no-console
      console.warn(
        `Tried removing localStorage key “${key}” even though environment is not a client`
      )
    }

    const defaultValue =
      initialValue instanceof Function ? initialValue() : initialValue

    window.localStorage.removeItem(key)
    setStoredValue(defaultValue)
    window.dispatchEvent(new StorageEvent("local-storage", { key }))
  })

  // A new key must show its own value on its first render, so state is
  // adjusted during render (React discards and re-renders; no frame paints
  // the previous key's value).
  const [readKey, setReadKey] = useState(key)
  if (readKey !== key) {
    setReadKey(key)
    setStoredValue(readValue())
  }

  const handleStorageChange = useCallback(
    (event: StorageEvent | CustomEvent) => {
      // The custom "local-storage" event is a CustomEvent with no `key`: a
      // keyless event is for every subscriber.
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

  // "storage" fires only for other documents; "local-storage" covers this one.
  useEventListener("storage", handleStorageChange)
  useEventListener("local-storage", handleStorageChange)

  return { value: storedValue, setValue, removeValue }
}
