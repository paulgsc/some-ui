import type { FC } from "react"
import { useEffect, useRef, useState } from "react"
import { CodeDisplay } from "@input/components/typing-game/code-display"
import { SettingsCard } from "@input/components/typing-game/settings-card"
import { StatsBar } from "@input/components/typing-game/stats-bar"
import { TypingErrorAlert } from "@input/components/typing-game/typing-error-alert"
import { TypingInputCard } from "@input/components/typing-game/typing-input-card"
import { useGameTimer, useTypingGame } from "@input/hooks"
import type {
  CodeSamplesMap,
  DisplayMode,
  GameState,
  Language,
} from "@input/types/leetype"
import { Badge, Card } from "some-ui-shared"

type LeetypeProps = {
  source: CodeSamplesMap
}

export const Leetype: FC<TypingGameProps> = ({ source }) => {
  const [gameState, setGameState] = useState<GameState>("idle")
  const [displayMode, setDisplayMode] = useState<DisplayMode>("shown")
  const [language, setLanguage] = useState<Language>("typescript")
  const [duration, setDuration] = useState(300)
  const [settingsExpanded, setSettingsExpanded] = useState(true)
  const [currentCode, setCurrentCode] = useState(source[language].code)

  const inputRef = useRef<HTMLTextAreaElement>(null)

  const typingGame = useTypingGame({
    targetCode: currentCode,
    gameState,
    onComplete: () => setGameState("finished"),
  })

  const timer = useGameTimer({
    gameState,
    duration,
    onTimeout: () => setGameState("timeout"),
  })

  // Load code sample when language changes
  useEffect(() => {
    const sample = source[language]
    setCurrentCode(sample.code)
    typingGame.reset()
  }, [language])

  const handleStart = () => {
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

  return (
    <div className="code absolute inset-0">
      {gameState === "idle" && (
        <SettingsCard
          language={language}
          displayMode={displayMode}
          duration={duration}
          expanded={settingsExpanded}
          onLanguageChange={(lang) => setLanguage(lang)}
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
          <CodeDisplay
            code={typingGame.displayCode}
            userInput={typingGame.userInput}
            language={language}
            displayMode={displayMode}
            gameState={gameState}
            targetUnits={typingGame.targetUnits}
            userUnits={typingGame.userUnits}
          />
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
