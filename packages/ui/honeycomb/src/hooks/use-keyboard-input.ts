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
  activeCharacters: Map<string, CharacterWithLifetime>
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
  activeCharacters,
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

      // Convert your Map<string, CharacterWithLifetime> to Set<string> of hangul chars
      const activeHangulChars = new Set(
        Array.from(activeCharacters.values()).map((char) => char.hangul)
      )

      // Process the key with greedy matching
      const result = keyboardManager.addKey(e.key, now, activeHangulChars)

      // Always update the visible buffer
      setKeyBuffer(keyboardManager.getBuffer())

      if (result.matched && result.hangul && result.keys) {
        // Successful match! Tell game bridge to process it
        const gameResult = gameBridge.processKeyPress(result.keys)

        if (gameResult.matched) {
          setActiveCharacters((prev) => {
            const next = new Map(prev)
            next.delete(gameResult.cellId)
            return next
          })

          setLastPoints(gameResult.points)
          setShowSuccessFeedback(true)
          setTimeout(() => setShowSuccessFeedback(false), 500)
        }

        setStats(gameBridge.getStats())
        setTimingParams(gameBridge.getTimingParams())
      } else if (
        !result.isPartialMatch &&
        keyboardManager.getBuffer().length > 0
      ) {
        // Buffer exists but isn't building toward any active character
        // Clear it since it's invalid
        keyboardManager.clearBuffer()
        setKeyBuffer("")
      }

      // Auto-clear on timeout
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
    activeCharacters,
    setActiveCharacters,
    setStats,
    setTimingParams,
    setKeyBuffer,
    setShowSuccessFeedback,
    setLastPoints,
  ])
}
