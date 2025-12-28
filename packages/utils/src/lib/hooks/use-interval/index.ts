import { useCallback, useEffect, useRef } from "react"

type IntervalCallbacks = {
  onError?: (error: Error) => void
  onSuccess?: () => void
  onPause?: () => void
  onResume?: () => void
}

type UseIntervalOptions = {
  duration: number // in milliseconds
  delay: number // in milliseconds
  callback: () => Promise<void> | void
  callbacks?: IntervalCallbacks
}

type UseIntervalResult = {
  pause: () => void
  resume: () => void
  restart: () => void
}

export function useInterval({
  duration,
  delay,
  callback,
  callbacks = {},
}: UseIntervalOptions): UseIntervalResult {
  const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const callbackRef = useRef(callback)
  const { onError, onSuccess, onPause, onResume } = callbacks

  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  useEffect(() => {
    return (): void => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [])

  const executeCallback = useCallback(async () => {
    try {
      await callbackRef.current()
      if (onSuccess) onSuccess()
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      if (onError) onError(error)

      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [onSuccess, onError])

  // Start the interval
  const startInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }

    if (onResume) onResume()

    const timeoutId = setTimeout(() => {
      executeCallback()

      // Then set up the interval for subsequent executions
      intervalRef.current = setInterval(executeCallback, duration)
    }, delay)

    return (): void => {
      clearTimeout(timeoutId)
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [executeCallback, duration, delay, onResume])

  const pause = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
      if (onPause) onPause()
    }
  }, [onPause])

  const resume = useCallback(() => {
    startInterval()
  }, [startInterval])

  const restart = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    startInterval()
  }, [startInterval])

  useEffect(() => {
    startInterval()

    return (): void => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [startInterval])

  return {
    pause,
    resume,
    restart,
  }
}
