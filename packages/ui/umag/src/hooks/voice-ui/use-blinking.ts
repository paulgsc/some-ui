import { useRef } from "react"

export const useBlinking = () => {
  const blinkState = useRef({
    isBlinking: false,
    blinkProgress: 0,
    nextBlink: Date.now() + 3000,
    blinkDuration: 0.12,
  })

  const updateBlinking = (now: number) => {
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
