import { useEffect, useLayoutEffect, useRef } from "react"

type Options = {
  callback: () => void
  duration: number
}
export const useApertureTimeout = ({ callback, duration }: Options): void => {
  const callbackRef = useRef(callback)
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(null)

  const useOverlayEffect =
    typeof window !== "undefined" ? useLayoutEffect : useEffect
  useOverlayEffect(() => {
    callbackRef.current = callback
  }, [callback])

  useEffect(() => {
    timeoutRef.current = setTimeout(() => {
      callbackRef.current()
    }, duration)
    return (): void => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
  }, [duration])
}
