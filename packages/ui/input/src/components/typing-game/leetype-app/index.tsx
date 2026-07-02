import type { FC } from "react"
import { useState } from "react"
import { ChallengeSelector } from "@input/components/typing-game/challenge-selector"
import { Leetype } from "@input/components/typing-game/leetype"
import { LevelProgress } from "@input/components/typing-game/level-progress"
import { ResultsCard } from "@input/components/typing-game/results-card"
import { SessionConfig } from "@input/components/typing-game/session-config"
import type { SessionStartConfig } from "@input/components/typing-game/session-config"
import { CHALLENGES } from "@input/data/leetype"
import { usePlayerProgress } from "@input/hooks/leetype/use-player-progress"
import type {
  Challenge,
  CompletedSessionStats,
  SolveRecord,
} from "@input/types/leetype"

type AppScreen = "selector" | "config" | "game" | "results"

type ResultState = {
  solve: SolveRecord
  xpEarned: number
  leveledUp: boolean
  newLevel: number
}

export const LeetypeApp: FC = () => {
  const [screen, setScreen] = useState<AppScreen>("selector")
  const [activeChallenge, setActiveChallenge] = useState<Challenge | null>(null)
  const [sessionConfig, setSessionConfig] = useState<SessionStartConfig | null>(
    null
  )
  const [lastResult, setLastResult] = useState<ResultState | null>(null)

  const { progress, recordSolve } = usePlayerProgress()

  const handleChallengeSelect = (challenge: Challenge): void => {
    setActiveChallenge(challenge)
    setScreen("config")
  }

  const handleSessionStart = (config: SessionStartConfig): void => {
    setSessionConfig(config)
    setScreen("game")
  }

  const handleSessionComplete = (stats: CompletedSessionStats): void => {
    if (!activeChallenge || !sessionConfig) return

    const prevLevel = progress.level
    const xpEarned = recordSolve({
      challengeId: activeChallenge.id,
      wpm: stats.wpm,
      accuracy: stats.accuracy,
      elapsedTime: stats.elapsedTime,
      errors: stats.errors,
      n: sessionConfig.nContext,
      displayMode: stats.displayMode,
      difficulty: activeChallenge.difficulty,
    })

    const solve: SolveRecord = {
      challengeId: activeChallenge.id,
      solvedAt: Date.now(),
      wpm: stats.wpm,
      accuracy: stats.accuracy,
      elapsedTime: stats.elapsedTime,
      errors: stats.errors,
      n: sessionConfig.nContext,
      displayMode: stats.displayMode,
      xpEarned,
    }

    setLastResult({
      solve,
      xpEarned,
      leveledUp: progress.level > prevLevel,
      newLevel: progress.level,
    })

    setScreen("results")
  }

  const handlePlayAgain = (): void => {
    setScreen("config")
  }

  const handleChooseChallenge = (): void => {
    setActiveChallenge(null)
    setSessionConfig(null)
    setLastResult(null)
    setScreen("selector")
  }

  return (
    <div className="dark code absolute inset-0 flex flex-col overflow-hidden bg-background p-6">
      {/* Level progress always visible at top */}
      <LevelProgress progress={progress} compact className="mb-4" />

      {screen === "selector" && (
        <div className="flex-1 overflow-auto">
          <ChallengeSelector
            challenges={CHALLENGES}
            progress={progress}
            onSelect={handleChallengeSelect}
          />
        </div>
      )}

      {screen === "config" && activeChallenge && (
        <div className="flex-1 overflow-auto">
          <SessionConfig
            challenge={activeChallenge}
            onStart={handleSessionStart}
            onBack={() => setScreen("selector")}
          />
        </div>
      )}

      {screen === "game" && activeChallenge && sessionConfig && (
        <div className="relative flex-1">
          <Leetype
            challenge={activeChallenge}
            initialLanguage={sessionConfig.language}
            initialDuration={sessionConfig.duration}
            nContext={sessionConfig.nContext}
            onSessionComplete={handleSessionComplete}
          />
        </div>
      )}

      {screen === "results" && activeChallenge && lastResult && (
        <div className="flex-1 overflow-auto">
          <ResultsCard
            challenge={activeChallenge}
            solve={lastResult.solve}
            xpEarned={lastResult.xpEarned}
            leveledUp={lastResult.leveledUp}
            newLevel={lastResult.newLevel}
            onPlayAgain={handlePlayAgain}
            onChooseChallenge={handleChooseChallenge}
          />
        </div>
      )}
    </div>
  )
}
