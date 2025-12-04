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
import { useFormattedCode } from "@input/hooks/leetype/use-formatted-code"
import type { DisplayMode, GameState, Language } from "@input/types/leetype"
import { Badge, Card } from "some-ui-shared"

type LeetypeProps = {
  codePaths: Record<Language, string>
}

const PRETTIER_PARSER_MAP: Record<Language, string> = {
  typescript: "typescript",
  rust: "rust",
  cpp: "babel",
  c: "typescript",
}

export const Leetype: FC<LeetypeProps> = ({ codePaths }) => {
  const [gameState, setGameState] = useState<GameState>("idle")
  const [displayMode, setDisplayMode] = useState<DisplayMode>("shown")
  const [language, setLanguage] = useState<Language>("typescript")
  const [duration, setDuration] = useState(300)
  const [settingsExpanded, setSettingsExpanded] = useState(true)

  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Load code from file
  const codeState = useFormattedCode(codePaths[language], {
    prettierParser: PRETTIER_PARSER_MAP[language] as any,
  })

  const typingGame = useTypingGame({
    targetCode: codeState.status === "SUCCESS" ? codeState.code : "",
    gameState,
    onComplete: () => setGameState("finished"),
  })

  const timer = useGameTimer({
    gameState,
    duration,
    onTimeout: () => setGameState("timeout"),
  })

  // Reset game when language changes or code loads
  useEffect(() => {
    if (codeState.status === "SUCCESS") {
      typingGame.reset()
      if (gameState === "playing") {
        setGameState("idle")
        setSettingsExpanded(true)
      }
    }
  }, [language, codeState.status])

  const handleStart = () => {
    if (codeState.status !== "SUCCESS") return
    setGameState("playing")
    typingGame.start()
    setSettingsExpanded(false)
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  const handleReset = () => {
    setGameState("idle")
    typingGame.reset()
    setSettingsExpanded(true)
  }

  const handleLanguageChange = (lang: Language) => {
    setLanguage(lang)
    setGameState("idle")
    setSettingsExpanded(true)
  }

  return (
    <div className="code absolute inset-0">
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
        wpm={typingGame.wpm}
        accuracy={typingGame.accuracy}
        progress={typingGame.progress}
        errors={typingGame.errors}
        gameState={gameState}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6 bg-card border-border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-card-foreground">
              Target Code
            </h2>
            <Badge variant="secondary" className="font-mono">
              {language}
            </Badge>
          </div>
          {codeState.status === "LOADING" ? (
            <LoadingCodeState attempt={codeState.attempt} />
          ) : codeState.status === "ERROR" ? (
            <ErrorCodeState
              error={codeState.error}
              path={codePaths[language]}
              onRetry={() => handleLanguageChange(language)}
            />
          ) : codeState.status === "SUCCESS" ? (
            <CodeDisplay
              displayCode={typingGame.displayCode}
              language={language}
              targetUnits={typingGame.targetUnits}
              cursorUnitIndex={typingGame.cursorUnitIndex}
              userUnits={typingGame.userUnits}
            />
          ) : (
            <LoadingCodeState attempt={0} />
          )}
        </Card>

        <TypingInputCard
          gameState={gameState}
          userInput={typingGame.userInput}
          elapsedTime={typingGame.elapsedTime}
          accuracy={typingGame.accuracy}
          progress={typingGame.progress}
          onStart={handleStart}
          onReset={handleReset}
          onInputChange={typingGame.handleInputChange}
          inputRef={inputRef}
          disabled={codeState.status !== "SUCCESS"}
        />

        <TypingErrorAlert
          consecutiveErrors={typingGame.consecutiveErrors}
          onDismiss={typingGame.onDismiss}
          showErrorAlert={typingGame.showErrorAlert}
        />
      </div>
    </div>
  )
}
