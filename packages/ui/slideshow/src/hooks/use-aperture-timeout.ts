import { useEffect, useRef } from "react"

type Options = {
  callback: () => void
  duration: number
}

export const useApertureTimeout = ({ callback, duration }: Options): void => {
  const callbackRef = useRef(callback)

  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      callbackRef.current()
    }, duration)

    return (): void => {
      clearTimeout(timeoutId)
    }
  }, [duration])
}
