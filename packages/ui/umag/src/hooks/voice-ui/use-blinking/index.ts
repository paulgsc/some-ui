import { useEffect, useRef } from "react"

type BlinkState = {
  isBlinking: boolean
  blinkProgress: number
  nextBlink: number
  blinkDuration: number
}

type UseBlinkingReturn = {
  blinkState: React.RefObject<BlinkState>
  updateBlinking: (now: number) => void
}

// Initial nextBlink is a placeholder (never in the past for a real caller
// that ticks with performance.now()/rAF timestamps) — the real mount-time
// value is assigned in the effect below, since reading the actual clock is
// impure and must not happen during render.
const INITIAL_NEXT_BLINK_PLACEHOLDER = Number.POSITIVE_INFINITY

export const useBlinking = (): UseBlinkingReturn => {
  const blinkState = useRef<BlinkState>({
    isBlinking: false,
    blinkProgress: 0,
    nextBlink: INITIAL_NEXT_BLINK_PLACEHOLDER,
    blinkDuration: 0.12,
  })

  useEffect(() => {
    blinkState.current.nextBlink = Date.now() + 3000
  }, [])

  const updateBlinking = (now: number): void => {
    if (now > blinkState.current.nextBlink && !blinkState.current.isBlinking) {
      blinkState.current.isBlinking = true
      blinkState.current.blinkProgress = 0
      blinkState.current.blinkDuration = 0.08 + Math.random() * 0.08
    }

    if (blinkState.current.isBlinking) {
      blinkState.current.blinkProgress += blinkState.current.blinkDuration
      if (blinkState.current.blinkProgress >= 1) {
        blinkState.current.isBlinking = false
        blinkState.current.blinkProgress = 0
        blinkState.current.nextBlink = now + 1500 + Math.random() * 3500
      }
    }
  }

  return { blinkState, updateBlinking }
}
