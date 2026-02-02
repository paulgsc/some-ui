import { Clock, Layers, Target, Trophy } from "lucide-react"
import { Button } from "some-ui-shared"

interface SessionHeaderProps {
  timeRemaining: number
  score: number
  totalQuestions: number
  currentBatch: number
  totalBatches: number
  onEndSession: () => void
}

export function SessionHeader({
  timeRemaining,
  score,
  totalQuestions,
  currentBatch,
  totalBatches,
  onEndSession,
}: SessionHeaderProps) {
  const minutes = Math.floor(timeRemaining / 60)
  const seconds = timeRemaining % 60

  return (
    <header className="border-b bg-card px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Korean Study Session
            </h1>
            <p className="text-sm text-muted-foreground">
              TOPIK 3-4 Comprehension Practice
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 px-4 py-2 bg-secondary rounded-lg">
            <Layers className="size-4 text-accent" />
            <span className="font-semibold">
              Conversation {currentBatch}/{totalBatches}
            </span>
          </div>

          <div className="flex items-center gap-2 px-4 py-2 bg-secondary rounded-lg">
            <Clock className="size-4 text-primary" />
            <span className="font-mono font-semibold text-lg">
              {String(minutes).padStart(2, "0")}:
              {String(seconds).padStart(2, "0")}
            </span>
          </div>

          <div className="flex items-center gap-2 px-4 py-2 bg-secondary rounded-lg">
            <Trophy className="size-4 text-accent" />
            <span className="font-semibold">
              {score}/{totalQuestions}
            </span>
          </div>

          <Button variant="outline" size="sm" onClick={onEndSession}>
            <Target className="size-4 mr-2" />
            End Session
          </Button>
        </div>
      </div>
    </header>
  )
}
