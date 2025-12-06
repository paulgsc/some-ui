import type { FC, RefObject } from "react"
import type { GameState } from "@input/types/leetype"
import { Play, RotateCcw } from "lucide-react"
import { Button, Card } from "some-ui-shared"
import { cn } from "some-ui-utils"

type TypingInputCardProps = {
  gameState: GameState
  disabled: boolean
  userInput: string
  elapsedTime: number
  accuracy: number
  progress: number
  onStart: () => void
  onReset: () => void
  onInputChange: (value: string) => void
  inputRef: RefObject<HTMLTextAreaElement | null>
}

export const TypingInputCard: FC<TypingInputCardProps> = ({
  gameState,
  disabled,
  userInput,
  elapsedTime,
  accuracy,
  progress,
  onStart,
  onReset,
  onInputChange,
  inputRef,
}) => {
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  return (
    <Card className="p-6 bg-card border-border">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-card-foreground">
          Your Input
        </h2>
        <div className="flex gap-2">
          {gameState === "idle" && (
            <Button onClick={onStart} className="gap-2">
              <Play className="w-4 h-4" />
              Start
            </Button>
          )}
          {(gameState === "finished" || gameState === "timeout") && (
            <Button
              onClick={onReset}
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
            onChange={(e) => onInputChange(e.target.value)}
            disabled={disabled}
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
  )
}
