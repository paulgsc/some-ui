import type { FC } from "react"
import { useEffect, useRef, useState } from "react"
import { CodeInputCard } from "@leetype/components/typing-game/code-input-card"
import type { GameInfoContent } from "@leetype/components/typing-game/game-bottom-nav"
import { GameBottomNav } from "@leetype/components/typing-game/game-bottom-nav"
import { TypingErrorAlert } from "@leetype/components/typing-game/typing-error-alert"
import { useGameTimer } from "@leetype/hooks"
import { useTypingGame } from "@leetype/hooks/leetype"
import { useChunkedCode } from "@leetype/hooks/leetype/use-chunked-code"
import { ADAPTIVE_WPM_THRESHOLD } from "@leetype/lib/leetype/player-store"
import type {
  Challenge,
  ChunkCompletionStats,
  CompletedSessionStats,
  DisplayMode,
  GameState,
  Language,
  NContext,
} from "@leetype/types/leetype"
import { Badge } from "some-ui-shared"

type LeetypeProps = {
  /** Direct code paths (legacy / story mode) */
  codePaths?: Record<Language, string>
  /** Challenge metadata — enables adaptive mode and difficulty enforcement */
  challenge?: Challenge
  /** Pre-selected language (challenge mode) */
  initialLanguage?: Language
  /** Pre-selected duration in seconds (challenge mode) */
  initialDuration?: number
  /** N context label (challenge mode, algo challenges only) */
  nContext?: NContext | null
  /** Called when the session ends (finished or timeout) */
  onSessionComplete?: (stats: CompletedSessionStats) => void
}

type PrettierParser = "typescript" | "babel" | "rust" | "cpp"

const PRETTIER_PARSER_MAP: Record<Language, PrettierParser> = {
  typescript: "typescript",
  rust: "rust",
  cpp: "babel",
  c: "typescript",
}

const DEFAULT_PROMPT_DESCRIPTION =
  "Describe what the user is supposed to implement, constraints, edge cases, or reasoning hints here."

type CumulativeStats = {
  totalChunks: number
  totalCharsTyped: number
  totalErrors: number
}

export const Leetype: FC<LeetypeProps> = ({
  codePaths,
  challenge,
  initialLanguage,
  initialDuration,
  nContext,
  onSessionComplete,
}) => {
  const isLegacyMode = !challenge

  const [gameState, setGameState] = useState<GameState>("idle")
  const [displayMode, setDisplayMode] = useState<DisplayMode>("shown")
  const [language, setLanguage] = useState<Language>(
    initialLanguage ?? "typescript"
  )
  const [duration, setDuration] = useState(initialDuration ?? 300)
  const [adaptiveHidden, setAdaptiveHidden] = useState(false)
  const [cumulativeStats, setCumulativeStats] = useState<CumulativeStats>({
    totalChunks: 0,
    totalCharsTyped: 0,
    totalErrors: 0,
  })

  const inputRef = useRef<HTMLTextAreaElement>(null)
  const onSessionCompleteRef = useRef(onSessionComplete)
  const latestStatsRef = useRef<CompletedSessionStats>({
    wpm: 0,
    accuracy: 100,
    elapsedTime: 0,
    errors: 0,
    displayMode: "shown",
    wasAdaptive: false,
    gameState: "finished",
  })

  useEffect(() => {
    onSessionCompleteRef.current = onSessionComplete
  }, [onSessionComplete])

  const effectiveCodePaths: Partial<Record<Language, string>> =
    challenge?.codePaths ?? codePaths ?? {}

  const codeState = useChunkedCode(effectiveCodePaths[language] ?? "", {
    prettierParser: PRETTIER_PARSER_MAP[language],
    linesPerChunk: 150,
  })

  const targetCode = codeState.currentChunk?.content ?? ""

  const currentChunkNumber =
    codeState.totalLines > 0 ? Math.floor(codeState.currentLine / 100) + 1 : 1
  const totalChunksEstimate =
    codeState.totalLines > 0 ? Math.ceil(codeState.totalLines / 100) : 1

  const handleChunkComplete = (chunkStats: ChunkCompletionStats): void => {
    setCumulativeStats((prev) => ({
      totalChunks: prev.totalChunks + 1,
      totalCharsTyped: prev.totalCharsTyped + chunkStats.chars_typed,
      totalErrors: prev.totalErrors + chunkStats.errors,
    }))

    if (codeState.hasMore) {
      codeState.loadNextChunk()
    } else {
      setGameState("finished")
    }
  }

  const {
    onDismiss,
    showErrorAlert,
    consecutiveErrors,
    userInput,
    elapsedTime,
    cursorUnitIndex,
    userUnits,
    displayCode,
    targetUnits,
    errors,
    progress,
    accuracy,
    wpm,
    start,
    reset,
    handleInputChange,
  } = useTypingGame({
    targetCode,
    gameState,
    onComplete: () => {},
    onChunkComplete: handleChunkComplete,
  })

  const timer = useGameTimer({
    gameState,
    duration,
    onTimeout: () => setGameState("timeout"),
  })

  // Adaptive mode: latch hidden flag when WPM crosses threshold during play.
  // Calling setState during render (getDerivedStateFromProps equivalent) causes
  // React to discard the current render and immediately re-render — not an effect.
  if (
    !adaptiveHidden &&
    gameState === "playing" &&
    wpm >= ADAPTIVE_WPM_THRESHOLD
  ) {
    setAdaptiveHidden(true)
  }

  const isHardDifficulty = challenge?.difficulty === "hard"
  const effectiveDisplayMode: DisplayMode =
    isHardDifficulty || adaptiveHidden ? "hidden" : displayMode

  const totalErrors = cumulativeStats.totalErrors + errors

  useEffect(() => {
    latestStatsRef.current = {
      wpm,
      accuracy,
      elapsedTime,
      errors: totalErrors,
      displayMode: effectiveDisplayMode,
      wasAdaptive: adaptiveHidden,
      gameState: "finished",
    }
  }, [
    wpm,
    accuracy,
    elapsedTime,
    totalErrors,
    effectiveDisplayMode,
    adaptiveHidden,
  ])

  // Fire onSessionComplete when game ends
  useEffect(() => {
    if (gameState !== "finished" && gameState !== "timeout") return
    const statsSnapshot: CompletedSessionStats = {
      ...latestStatsRef.current,
      gameState,
    }
    onSessionCompleteRef.current?.(statsSnapshot)
  }, [gameState])

  useEffect(() => {
    if (codeState.status === "SUCCESS") {
      reset()
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGameState("idle")
      setCumulativeStats({ totalChunks: 0, totalCharsTyped: 0, totalErrors: 0 })
      setAdaptiveHidden(false)
    }
  }, [reset, language, codeState.status])

  const handleStart = (): void => {
    if (codeState.status !== "SUCCESS") return
    setGameState("playing")
    start()
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  const handleReset = (): void => {
    setGameState("idle")
    reset()
    setCumulativeStats({ totalChunks: 0, totalCharsTyped: 0, totalErrors: 0 })
    setAdaptiveHidden(false)
  }

  const handleLanguageChange = (lang: Language): void => {
    setLanguage(lang)
    setGameState("idle")
    setCumulativeStats({ totalChunks: 0, totalCharsTyped: 0, totalErrors: 0 })
    setAdaptiveHidden(false)
  }

  const overallProgress =
    totalChunksEstimate > 0
      ? ((cumulativeStats.totalChunks + progress / 100) / totalChunksEstimate) *
        100
      : progress

  const chunkLabel = `Chunk ${currentChunkNumber}/${totalChunksEstimate}${
    codeState.hasMore ? "+" : ""
  }`

  const info: GameInfoContent = {
    title: challenge ? challenge.title : "Problem Description",
    description: challenge ? challenge.description : DEFAULT_PROMPT_DESCRIPTION,
    tags: challenge ? challenge.tags : [],
  }

  return (
    <div className="dark code absolute inset-0 flex flex-col overflow-hidden">
      {/* Challenge identity strip — kept slim so the viewport still belongs
          to the code/input card below; everything actionable lives in the
          bottom nav's menus instead of inline controls. */}
      {challenge && (
        <div className="mb-3 flex shrink-0 items-center gap-3">
          <span className="text-base font-semibold text-card-foreground">
            {challenge.title}
          </span>
          <Badge
            variant={
              challenge.difficulty === "easy"
                ? "default"
                : challenge.difficulty === "medium"
                  ? "secondary"
                  : "destructive"
            }
            className="capitalize"
          >
            {challenge.difficulty}
          </Badge>
          {nContext && (
            <Badge variant="outline" className="font-mono text-xs capitalize">
              N={nContext}
            </Badge>
          )}
          {effectiveDisplayMode === "hidden" && (
            <Badge variant="outline" className="text-xs text-muted-foreground">
              {adaptiveHidden ? "Adaptive: hidden" : "Hidden mode"}
            </Badge>
          )}
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        <CodeInputCard
          status={codeState.status}
          loadError={codeState.error}
          path={effectiveCodePaths[language] ?? ""}
          onRetryLoad={() => handleLanguageChange(language)}
          displayCode={displayCode}
          language={language}
          targetUnits={targetUnits}
          userUnits={userUnits}
          cursorUnitIndex={cursorUnitIndex}
          displayMode={effectiveDisplayMode}
          adaptiveMessage={
            adaptiveHidden
              ? `Adaptive mode engaged at ${ADAPTIVE_WPM_THRESHOLD} WPM`
              : undefined
          }
          gameState={gameState}
          userInput={userInput}
          onInputChange={handleInputChange}
          inputRef={inputRef}
          elapsedTime={elapsedTime}
          accuracy={accuracy}
          progress={progress}
        />

        <div className="pointer-events-none absolute inset-x-4 top-4 z-10">
          <div className="pointer-events-auto">
            <TypingErrorAlert
              consecutiveErrors={consecutiveErrors}
              onDismiss={onDismiss}
              showErrorAlert={showErrorAlert}
            />
          </div>
        </div>
      </div>

      <GameBottomNav
        gameState={gameState}
        onStart={handleStart}
        onReset={handleReset}
        timeLeft={timer.timeLeft}
        duration={duration}
        wpm={wpm}
        accuracy={accuracy}
        progress={overallProgress}
        errors={totalErrors}
        chunkLabel={chunkLabel}
        language={language}
        displayMode={displayMode}
        displayModeLocked={isHardDifficulty || adaptiveHidden}
        settingsEnabled={isLegacyMode && gameState === "idle"}
        onLanguageChange={handleLanguageChange}
        onDisplayModeChange={setDisplayMode}
        onDurationChange={setDuration}
        info={info}
      />
    </div>
  )
}
