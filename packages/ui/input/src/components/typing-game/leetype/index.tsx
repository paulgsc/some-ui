import type { FC } from "react"
import { useEffect, useRef, useState } from "react"
import { CodeDisplay } from "@input/components/typing-game/code-display"
import { ChevronDown, Play, RotateCcw, Settings2 } from "lucide-react"
import {
  Badge,
  Button,
  Card,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "some-ui-shared"
import { cn } from "some-ui-utils"

type GameState = "idle" | "playing" | "finished" | "timeout"
type DisplayMode = "shown" | "hidden"
type Language = "typescript" | "rust" | "cpp" | "c"

type CodeSample = {
  /** Display title (problem name) */
  title: string

  /** Short problem description */
  description: string

  /** Full code shown to the user */
  code: string
}

type CodeSamplesMap = {
  [L in Language]: CodeSample
}

type TypingGameProps = {
  source: CodeSamplesMap
}

export const Leetype: FC<TypingGameProps> = ({ source }) => {
  const [gameState, setGameState] = useState<GameState>("idle")
  const [displayMode, setDisplayMode] = useState<DisplayMode>("shown")
  const [language, setLanguage] = useState<Language>("typescript")
  const [duration, setDuration] = useState(300) // 5 minutes default
  const [currentCode, setCurrentCode] = useState("")
  const [userInput, setUserInput] = useState("")
  const [timeLeft, setTimeLeft] = useState(duration)
  const [startTime, setStartTime] = useState<number | null>(null)
  const [errors, setErrors] = useState(0)
  const [settingsExpanded, setSettingsExpanded] = useState(true)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load code sample when language changes
  useEffect(() => {
    const sample = source[language]
    setCurrentCode(sample.code)
    setUserInput("")
    setErrors(0)
  }, [language])

  // Timer logic
  useEffect(() => {
    if (gameState === "playing") {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            setGameState("timeout")
            return 0
          }
          return prev - 1
        })
      }, 1000)
    } else if (timerRef.current) {
      clearInterval(timerRef.current)
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [gameState])

  // Check for completion
  useEffect(() => {
    if (gameState === "playing" && userInput === currentCode) {
      setGameState("finished")
    }
  }, [userInput, currentCode, gameState])

  // Calculate stats
  const progress =
    currentCode.length > 0 ? (userInput.length / currentCode.length) * 100 : 0
  const accuracy =
    userInput.length > 0
      ? ((userInput.length - errors) / userInput.length) * 100
      : 100
  const elapsedTime = startTime
    ? Math.floor((Date.now() - startTime) / 1000)
    : 0
  const wpm =
    elapsedTime > 0 ? Math.floor(userInput.length / 5 / (elapsedTime / 60)) : 0

  const handleStart = () => {
    setGameState("playing")
    setUserInput("")
    setErrors(0)
    setTimeLeft(duration)
    setStartTime(Date.now())
    setSettingsExpanded(false)
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  const handleReset = () => {
    setGameState("idle")
    setUserInput("")
    setErrors(0)
    setTimeLeft(duration)
    setStartTime(null)
    setSettingsExpanded(true)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (gameState !== "playing") return

    const input = e.target.value
    const currentChar = input[input.length - 1]
    const expectedChar = currentCode[input.length - 1]

    if (currentChar !== expectedChar && input.length > userInput.length) {
      setErrors((prev) => prev + 1)
    }

    setUserInput(input)
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  return (
    <div className="code container mx-auto px-4 py-8 max-w-7xl">
      {gameState === "idle" && (
        <Card className="p-4 mb-6 bg-card border-border">
          <button
            onClick={() => setSettingsExpanded(!settingsExpanded)}
            className="flex items-center justify-between w-full text-left"
          >
            <div className="flex items-center gap-2">
              <Settings2 className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold text-card-foreground">
                Game Settings
              </h2>
            </div>
            <ChevronDown
              className={cn(
                "w-5 h-5 text-muted-foreground transition-transform",
                settingsExpanded && "rotate-180"
              )}
            />
          </button>

          {settingsExpanded && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 pt-4 border-t border-border">
              <div className="space-y-2">
                <label className="text-sm font-medium text-card-foreground">
                  Language
                </label>
                <Select
                  value={language}
                  onValueChange={(v) => setLanguage(v as Language)}
                >
                  <SelectTrigger className="bg-secondary border-border text-secondary-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="typescript">TypeScript</SelectItem>
                    <SelectItem value="rust">Rust</SelectItem>
                    <SelectItem value="cpp">C++</SelectItem>
                    <SelectItem value="c">C</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-card-foreground">
                  Display Mode
                </label>
                <Select
                  value={displayMode}
                  onValueChange={(v) => setDisplayMode(v as DisplayMode)}
                >
                  <SelectTrigger className="bg-secondary border-border text-secondary-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="shown">Shown</SelectItem>
                    <SelectItem value="hidden">Hidden</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-card-foreground">
                  Duration
                </label>
                <Select
                  value={duration.toString()}
                  onValueChange={(v) => setDuration(Number.parseInt(v))}
                >
                  <SelectTrigger className="bg-secondary border-border text-secondary-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="60">1 minute</SelectItem>
                    <SelectItem value="180">3 minutes</SelectItem>
                    <SelectItem value="300">5 minutes</SelectItem>
                    <SelectItem value="600">10 minutes</SelectItem>
                    <SelectItem value="900">15 minutes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <Card className="p-4 bg-card border-border">
          <div className="text-sm text-muted-foreground mb-1">Time</div>
          <div className="text-2xl font-mono font-bold text-card-foreground">
            {formatTime(gameState === "playing" ? timeLeft : duration)}
          </div>
        </Card>

        <Card className="p-4 bg-card border-border">
          <div className="text-sm text-muted-foreground mb-1">WPM</div>
          <div className="text-2xl font-mono font-bold text-primary">{wpm}</div>
        </Card>

        <Card className="p-4 bg-card border-border">
          <div className="text-sm text-muted-foreground mb-1">Accuracy</div>
          <div className="text-2xl font-mono font-bold text-accent">
            {accuracy.toFixed(0)}%
          </div>
        </Card>

        <Card className="p-4 bg-card border-border">
          <div className="text-sm text-muted-foreground mb-1">Progress</div>
          <div className="text-2xl font-mono font-bold text-card-foreground">
            {progress.toFixed(0)}%
          </div>
        </Card>

        <Card className="p-4 bg-card border-border">
          <div className="text-sm text-muted-foreground mb-1">Errors</div>
          <div className="text-2xl font-mono font-bold text-destructive">
            {errors}
          </div>
        </Card>
      </div>

      {/* Main Game Area */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Code Display */}
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
            code={currentCode}
            userInput={userInput}
            language={language}
            displayMode={displayMode}
            gameState={gameState}
          />
        </Card>

        {/* Typing Input */}
        <Card className="p-6 bg-card border-border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-card-foreground">
              Your Input
            </h2>
            <div className="flex gap-2">
              {gameState === "idle" && (
                <Button onClick={handleStart} className="gap-2">
                  <Play className="w-4 h-4" />
                  Start
                </Button>
              )}
              {(gameState === "finished" || gameState === "timeout") && (
                <Button
                  onClick={handleReset}
                  variant="outline"
                  className="gap-2 bg-transparent"
                >
                  <RotateCcw className="w-4 h-4" />
                  Reset
                </Button>
              )}
            </div>
          </div>

          {gameState === "idle" && (
            <div className="flex items-center justify-center h-[500px] text-muted-foreground">
              <div className="text-center space-y-4">
                <div className="text-6xl">⌨️</div>
                <p className="text-lg">Click Start to begin typing</p>
              </div>
            </div>
          )}

          {(gameState === "playing" ||
            gameState === "finished" ||
            gameState === "timeout") && (
            <>
              <textarea
                ref={inputRef}
                value={userInput}
                onChange={handleInputChange}
                disabled={gameState !== "playing"}
                className={cn(
                  "w-full h-[500px] p-4 font-mono text-sm",
                  "bg-secondary text-secondary-foreground",
                  "border border-border rounded-lg",
                  "resize-none focus:outline-none focus:ring-2 focus:ring-ring",
                  "disabled:opacity-50 disabled:cursor-not-allowed"
                )}
                spellCheck={false}
                autoCapitalize="off"
                autoComplete="off"
                autoCorrect="off"
              />

              {gameState === "finished" && (
                <div className="mt-4 p-4 bg-primary/10 border border-primary rounded-lg">
                  <p className="text-primary font-semibold text-center">
                    Completed in {formatTime(elapsedTime)} with{" "}
                    {accuracy.toFixed(1)}% accuracy!
                  </p>
                </div>
              )}

              {gameState === "timeout" && (
                <div className="mt-4 p-4 bg-destructive/10 border border-destructive rounded-lg">
                  <p className="text-destructive font-semibold text-center">
                    Time's up! You typed {progress.toFixed(0)}% of the code.
                  </p>
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
