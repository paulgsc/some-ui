import { useCallback, useState } from "react"
import {
  addSolve,
  computeLevel,
  loadProgress,
  saveProgress,
  xpForNextLevel,
  ALGORITHM_UNLOCK_LEVEL,
} from "@input/lib/leetype/player-store"
import type { Difficulty, DisplayMode, NContext, PlayerProgress, SolveRecord } from "@input/types/leetype"

type AddSolveInput = {
  challengeId: string
  wpm: number
  accuracy: number
  elapsedTime: number
  errors: number
  n: NContext | null
  displayMode: DisplayMode
  difficulty: Difficulty
}

type UsePlayerProgressReturn = {
  progress: PlayerProgress
  algorithmUnlocked: boolean
  xpToNextLevel: number
  recordSolve: (input: AddSolveInput) => number
  resetProgress: () => void
}

export function usePlayerProgress(): UsePlayerProgressReturn {
  const [progress, setProgress] = useState<PlayerProgress>(loadProgress)

  const algorithmUnlocked = progress.level >= ALGORITHM_UNLOCK_LEVEL

  const xpToNextLevel =
    xpForNextLevel(progress.level) - progress.xp

  const recordSolve = useCallback((input: AddSolveInput): number => {
    const { difficulty, ...rest } = input
    const solveBase: Omit<SolveRecord, "xpEarned"> = {
      ...rest,
      solvedAt: Date.now(),
    }
    let earned = 0
    setProgress((prev) => {
      const { next, xpEarned } = addSolve(prev, solveBase, difficulty)
      earned = xpEarned
      saveProgress(next)
      return next
    })
    return earned
  }, [])

  const resetProgress = useCallback(() => {
    const fresh = { xp: 0, level: computeLevel(0), solves: [] }
    saveProgress(fresh)
    setProgress(fresh)
  }, [])

  return { progress, algorithmUnlocked, xpToNextLevel, recordSolve, resetProgress }
}
