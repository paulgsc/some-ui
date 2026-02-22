import type { FC } from "react"
import { useEffect, useRef, useState } from "react"
import { CodeDisplay } from "@input/components/typing-game/code-display"
import { ErrorCodeState } from "@input/components/typing-game/error-code-state"
import { LoadingCodeState } from "@input/components/typing-game/loading-code-state"
import { SettingsCard } from "@input/components/typing-game/settings-card"
import { StatsBar } from "@input/components/typing-game/stats-bar"
import { TypingErrorAlert } from "@input/components/typing-game/typing-error-alert"
import { TypingInputCard } from "@input/components/typing-game/typing-input-card"
import { useGameTimer } from "@input/hooks"
import { useTypingGame } from "@input/hooks/leetype"
import { useChunkedCode } from "@input/hooks/leetype/use-chunked-code"
import type {
  ChunkCompletionStats,
  DisplayMode,
  GameState,
  Language,
} from "@input/types/leetype"
import { Badge, Tabs, TabsContent, TabsList, TabsTrigger } from "some-ui-shared"

type LeetypeProps = {
  codePaths: Record<Language, string>
}

const PRETTIER_PARSER_MAP: Record<Language, string> = {
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

export const Leetype: FC<LeetypeProps> = ({ codePaths }) => {
  const [gameState, setGameState] = useState<GameState>("idle")
  const [displayMode, setDisplayMode] = useState<DisplayMode>("shown")
  const [language, setLanguage] = useState<Language>("typescript")
  const [duration, setDuration] = useState(300)
  const [settingsExpanded, setSettingsExpanded] = useState(true)
  const [cumulativeStats, setCumulativeStats] = useState<CumulativeStats>({
    totalChunks: 0,
    totalCharsTyped: 0,
    totalErrors: 0,
  })

  const inputRef = useRef<HTMLTextAreaElement>(null)
  const codeDisplayRef = useRef<HTMLDivElement>(null)

  // Load code with automatic chunking for large files
  const codeState = useChunkedCode(codePaths[language], {
    prettierParser: PRETTIER_PARSER_MAP[language] as "rust" | "cpp" | "babel",
    linesPerChunk: 150,
  })

  // Get current active chunk (bouonded memory - only one chunk at a time)
  const targetCode = codeState.currentChunk?.content ?? ""

  // Calculate which chunk number we're on
  const currentChunkNumber =
    codeState.totalLines > 0 ? Math.floor(codeState.currentLine / 100) + 1 : 1
  const totalChunksEstimate =
    codeState.totalLines > 0 ? Math.ceil(codeState.totalLines / 100) : 1

  // Handle chunk completion
  const handleChunkComplete = (chunkStats: ChunkCompletionStats): void => {
    // Update cumulative stats
    setCumulativeStats((prev) => ({
      totalChunks: prev.totalChunks + 1,
      totalCharsTyped: prev.totalCharsTyped + chunkStats.chars_typed,
      totalErrors: prev.totalErrors + chunkStats.errors,
    }))

    // Check if there are more chunks
    if (codeState.hasMore) {
      // Load Next chunk (old chunk is GC'd - bounded memory)
      codeState.loadNextChunk()
    } else {
      // All chunks complete - game finished
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

  // Reset game when language changes or code loads
  useEffect(() => {
    if (codeState.status === "SUCCESS") {
      reset()
      setGameState("idle")
      setSettingsExpanded(true)
      setCumulativeStats({ totalChunks: 0, totalCharsTyped: 0, totalErrors: 0 })
    }
  }, [reset, language, codeState.status])

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
    setSettingsExpanded(true)
    setCumulativeStats({ totalChunks: 0, totalCharsTyped: 0, totalErrors: 0 })
  }

  const handleLanguageChange = (lang: Language): void => {
    setLanguage(lang)
    setGameState("idle")
    setSettingsExpanded(true)
    setCumulativeStats({ totalChunks: 0, totalCharsTyped: 0, totalErrors: 0 })
  }

  // Calculate overall progress across all chunks
  const overallProgress =
    totalChunksEstimate > 0
      ? ((cumulativeStats.totalChunks + progress / 100) / totalChunksEstimate) *
        100
      : progress

  return (
    <div className="code absolute inset-0 flex flex-col overflow-hidden">
      {gameState === "idle" && (
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

      <StatsBar
        timeLeft={timer.timeLeft}
        duration={duration}
        wpm={wpm}
        accuracy={accuracy}
        progress={overallProgress}
        errors={cumulativeStats.totalErrors + errors}
        gameState={gameState}
      />

      <div className="grid flex-1 min-h-0 grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT COLUMN */}
        <div className="flex min-w-0 flex-col">
          <Tabs defaultValue="code" className="flex flex-1 min-h-0 flex-col">
            {/* Header */}
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

            {/* Content container */}
            <div className="relative flex-1 min-h-0">
              <TabsContent
                value="code"
                className="absolute inset-0 flex min-h-0 flex-col rounded-lg border bg-card p-6"
              >
                <h2 className="mb-4 text-lg font-semibold text-card-foreground">
                  Target Code (Current Chunk)
                </h2>

                {/* Scroll containment */}
                <div
                  ref={codeDisplayRef}
                  className="min-h-0 flex-1 overflow-auto"
                >
                  {codeState.status === "LOADING" ? (
                    <LoadingCodeState attempt={1} />
                  ) : codeState.status === "ERROR" ? (
                    <ErrorCodeState
                      error={codeState.error}
                      path={codePaths[language]}
                      onRetry={() => handleLanguageChange(language)}
                    />
                  ) : codeState.status === "SUCCESS" ? (
                    <CodeDisplay
                      displayCode={displayCode}
                      language={language}
                      targetUnits={targetUnits}
                      cursorUnitIndex={cursorUnitIndex}
                      userUnits={userUnits}
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
                  Problem Description
                </h2>

                <p className="text-sm leading-relaxed text-muted-foreground">
                  Describe what the user is supposed to implement, constraints,
                  edge cases, or reasoning hints here.
                </p>
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
