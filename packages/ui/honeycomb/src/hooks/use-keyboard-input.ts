import { useEffect } from "react"
import type { KeyboardInputManager } from "@honeycomb/lib/hangul/keyboard-input-manager"
import type {
  GameStats,
  TimingParams,
  WasmGameBridge,
} from "@honeycomb/lib/hangul/wasm-game-bridge"
import type { CharacterWithLifetime } from "@honeycomb/types/hangul-types"

type UseKeyboardInputProps = {
  gameBridge: WasmGameBridge | null
  isInitialized: boolean
  isPaused: boolean
  keyboardManager: KeyboardInputManager
  setActiveCharacters: React.Dispatch<
    React.SetStateAction<Map<string, CharacterWithLifetime>>
  >
  setStats: React.Dispatch<
    React.SetStateAction<GameStats & { accuracy: number }>
  >
  setTimingParams: React.Dispatch<React.SetStateAction<TimingParams>>
  setKeyBuffer: React.Dispatch<React.SetStateAction<string>>
  setShowSuccessFeedback: React.Dispatch<React.SetStateAction<boolean>>
  setLastPoints: React.Dispatch<React.SetStateAction<number>>
}

export const useKeyboardInput = ({
  gameBridge,
  isInitialized,
  isPaused,
  keyboardManager,
  setActiveCharacters,
  setStats,
  setTimingParams,
  setKeyBuffer,
  setShowSuccessFeedback,
  setLastPoints,
}: UseKeyboardInputProps) => {
  useEffect(() => {
    if (isPaused || !gameBridge || !isInitialized) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey || e.key.length > 1) return
      if (e.key === " ") return

      const now = Date.now()
      const match = keyboardManager.addKey(e.key, now)

      setKeyBuffer(keyboardManager.getBuffer())

      if (match) {
        const result = gameBridge.processKeyPress(match.keys)

        if (result.matched) {
          setActiveCharacters((prev) => {
            const next = new Map(prev)
            next.delete(result.cellId)
            return next
          })

          setLastPoints(result.points)
          setShowSuccessFeedback(true)
          setTimeout(() => setShowSuccessFeedback(false), 500)

          keyboardManager.clearBuffer()
          setKeyBuffer("")
        }

        setStats(gameBridge.getStats())
        setTimingParams(gameBridge.getTimingParams())
      }

      setTimeout(() => {
        if (keyboardManager.shouldClearBuffer(Date.now())) {
          keyboardManager.clearBuffer()
          setKeyBuffer("")
        }
      }, 350)
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [
    gameBridge,
    keyboardManager,
    isPaused,
    isInitialized,
    setActiveCharacters,
    setStats,
    setTimingParams,
    setKeyBuffer,
    setShowSuccessFeedback,
    setLastPoints,
  ])
}
