import type { FC } from "react"
import type { GameState } from "@input/types/leetype"
import { Card } from "some-ui-shared"

type StatsBarProps = {
  timeLeft: number
  duration: number
  wpm: number
  accuracy: number
  progress: number
  errors: number
  gameState: GameState
}

export const StatsBar: FC<StatsBarProps> = ({
  timeLeft,
  duration,
  wpm,
  accuracy,
  progress,
  errors,
  gameState,
}): React.JSX.Element => {
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  return (
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
  )
}
