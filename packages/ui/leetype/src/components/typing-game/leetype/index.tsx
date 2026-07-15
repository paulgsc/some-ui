import type { FC } from "react"
import { useEffect, useRef, useState } from "react"
import { CodeDisplay } from "@leetype/components/typing-game/code-display"
import { ErrorCodeState } from "@leetype/components/typing-game/error-code-state"
import { LoadingCodeState } from "@leetype/components/typing-game/loading-code-state"
import { SettingsCard } from "@leetype/components/typing-game/settings-card"
import { StatsBar } from "@leetype/components/typing-game/stats-bar"
import { TypingErrorAlert } from "@leetype/components/typing-game/typing-error-alert"
import { TypingInputCard } from "@leetype/components/typing-game/typing-input-card"
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
import { Badge, Tabs, TabsContent, TabsList, TabsTrigger } from "some-ui-shared"

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
  const [settingsExpanded, setSettingsExpanded] = useState(true)
  const [adaptiveHidden, setAdaptiveHidden] = useState(false)
  const [cumulativeStats, setCumulativeStats] = useState<CumulativeStats>({
    totalChunks: 0,
    totalCharsTyped: 0,
    totalErrors: 0,
  })

  const inputRef = useRef<HTMLTextAreaElement>(null)
  const codeDisplayRef = useRef<HTMLDivElement>(null)
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
      if (isLegacyMode) setSettingsExpanded(true)
      setCumulativeStats({ totalChunks: 0, totalCharsTyped: 0, totalErrors: 0 })
      setAdaptiveHidden(false)
    }
  }, [reset, language, codeState.status, isLegacyMode])

  const handleStart = (): void => {
    if (codeState.status !== "SUCCESS") return
    setGameState("playing")
    start()
    setSettingsExpanded(false)
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  const handleReset = (): void => {
    setGameState("idle")
    reset()
    if (isLegacyMode) setSettingsExpanded(true)
    setCumulativeStats({ totalChunks: 0, totalCharsTyped: 0, totalErrors: 0 })
    setAdaptiveHidden(false)
  }

  const handleLanguageChange = (lang: Language): void => {
    setLanguage(lang)
    setGameState("idle")
    if (isLegacyMode) setSettingsExpanded(true)
    setCumulativeStats({ totalChunks: 0, totalCharsTyped: 0, totalErrors: 0 })
    setAdaptiveHidden(false)
  }

  const overallProgress =
    totalChunksEstimate > 0
      ? ((cumulativeStats.totalChunks + progress / 100) / totalChunksEstimate) *
        100
      : progress

  return (
    <div className="dark code absolute inset-0 flex flex-col overflow-hidden">
      {/* Settings card: only in legacy mode when idle */}
      {isLegacyMode && gameState === "idle" && (
        <SettingsCard
          language={language}
          displayMode={displayMode}
          duration={duration}
          expanded={settingsExpanded}
          onLanguageChange={handleLanguageChange}
          onDisplayModeChange={(mode) => setDisplayMode(mode)}
          onDurationChange={setDuration}
          onToggleExpanded={() => setSettingsExpanded(!settingsExpanded)}
        />
      )}

      {/* Challenge mode header */}
      {challenge && (
        <div className="mb-4 flex items-center gap-3">
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

      <StatsBar
        timeLeft={timer.timeLeft}
        duration={duration}
        wpm={wpm}
        accuracy={accuracy}
        progress={overallProgress}
        errors={totalErrors}
        gameState={gameState}
      />

      <div className="grid flex-1 min-h-0 grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT COLUMN */}
        <div className="flex min-w-0 flex-col">
          <Tabs defaultValue="code" className="flex flex-1 min-h-0 flex-col">
            <div className="flex items-center justify-between mb-4">
              <TabsList>
                <TabsTrigger value="code">Code</TabsTrigger>
                <TabsTrigger value="prompt">Prompt</TabsTrigger>
              </TabsList>

              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-mono text-xs">
                  Chunk {currentChunkNumber}/{totalChunksEstimate}
                  {codeState.hasMore && "+"}
                </Badge>
                <Badge variant="secondary" className="font-mono">
                  {language}
                </Badge>
              </div>
            </div>

            <div className="relative flex-1 min-h-0">
              <TabsContent
                value="code"
                className="absolute inset-0 flex min-h-0 flex-col rounded-lg border bg-card p-6"
              >
                <h2 className="mb-4 text-lg font-semibold text-card-foreground">
                  Target Code (Current Chunk)
                </h2>

                <div
                  ref={codeDisplayRef}
                  className="min-h-0 flex-1 overflow-auto"
                >
                  {codeState.status === "LOADING" ? (
                    <LoadingCodeState attempt={1} />
                  ) : codeState.status === "ERROR" ? (
                    <ErrorCodeState
                      error={codeState.error}
                      path={effectiveCodePaths[language] ?? ""}
                      onRetry={() => handleLanguageChange(language)}
                    />
                  ) : codeState.status === "SUCCESS" ? (
                    <CodeDisplay
                      displayCode={displayCode}
                      language={language}
                      targetUnits={targetUnits}
                      cursorUnitIndex={cursorUnitIndex}
                      userUnits={userUnits}
                      displayMode={effectiveDisplayMode}
                      adaptiveMessage={
                        adaptiveHidden
                          ? `Adaptive mode engaged at ${ADAPTIVE_WPM_THRESHOLD} WPM`
                          : undefined
                      }
                    />
                  ) : (
                    <LoadingCodeState attempt={0} />
                  )}
                </div>
              </TabsContent>

              <TabsContent
                value="prompt"
                className="absolute inset-0 overflow-auto rounded-lg border bg-card p-6"
              >
                <h2 className="mb-2 text-lg font-semibold text-card-foreground">
                  {challenge ? challenge.title : "Problem Description"}
                </h2>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {challenge
                    ? challenge.description
                    : "Describe what the user is supposed to implement, constraints, edge cases, or reasoning hints here."}
                </p>
                {challenge && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {challenge.tags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="outline"
                        className="font-mono text-xs"
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </TabsContent>
            </div>
          </Tabs>
        </div>

        {/* RIGHT COLUMN */}
        <div className="min-w-0">
          <TypingInputCard
            gameState={gameState}
            userInput={userInput}
            elapsedTime={elapsedTime}
            accuracy={accuracy}
            progress={progress}
            onStart={handleStart}
            onReset={handleReset}
            onInputChange={handleInputChange}
            inputRef={inputRef}
            disabled={codeState.status !== "SUCCESS"}
          />
        </div>

        {/* FULL-WIDTH ALERT */}
        <div className="lg:col-span-2">
          <TypingErrorAlert
            consecutiveErrors={consecutiveErrors}
            onDismiss={onDismiss}
            showErrorAlert={showErrorAlert}
          />
        </div>
      </div>
    </div>
  )
}
