import type { FC } from "react"
import type { Challenge, Difficulty, SolveRecord } from "@input/types/leetype"
import {
  CheckCircle2,
  EyeOff,
  RotateCcw,
  Trophy,
  XCircle,
  Zap,
} from "lucide-react"
import { Badge, Button, Card } from "some-ui-shared"
import { cn } from "some-ui-utils"

type ResultsCardProps = {
  challenge: Challenge
  solve: SolveRecord
  xpEarned: number
  leveledUp: boolean
  newLevel: number
  onPlayAgain: () => void
  onChooseChallenge: () => void
}

const DIFFICULTY_COLORS: Record<Difficulty, string> = {
  easy: "text-emerald-400",
  medium: "text-amber-400",
  hard: "text-rose-400",
}

type StatCellProps = {
  label: string
  value: string
  highlight?: boolean
}

const StatCell: FC<StatCellProps> = ({ label, value, highlight }) => (
  <Card className="flex flex-col items-center gap-1 p-4 bg-card border-border">
    <span className="text-xs text-muted-foreground">{label}</span>
    <span
      className={cn(
        "text-2xl font-mono font-bold",
        highlight ? "text-primary" : "text-card-foreground"
      )}
    >
      {value}
    </span>
  </Card>
)

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, "0")}`
}

export const ResultsCard: FC<ResultsCardProps> = ({
  challenge,
  solve,
  xpEarned,
  leveledUp,
  newLevel,
  onPlayAgain,
  onChooseChallenge,
}) => {
  const wasHidden = solve.displayMode === "hidden"

  return (
    <div className="flex flex-col gap-6">
      {/* Title row */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-7 w-7 text-primary shrink-0" />
          <div>
            <h2 className="text-xl font-bold text-card-foreground">
              Session Complete
            </h2>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-sm text-muted-foreground">
                {challenge.title}
              </span>
              <span
                className={cn(
                  "text-xs font-medium capitalize",
                  DIFFICULTY_COLORS[challenge.difficulty]
                )}
              >
                {challenge.difficulty}
              </span>
            </div>
          </div>
        </div>

        {/* XP earned badge */}
        <div className="flex flex-col items-center gap-1 rounded-lg border border-primary/30 bg-primary/10 px-4 py-2">
          <div className="flex items-center gap-1.5 text-primary">
            <Zap className="h-4 w-4" />
            <span className="text-2xl font-bold font-mono">+{xpEarned}</span>
          </div>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
            XP earned
          </span>
        </div>
      </div>

      {/* Level-up banner */}
      {leveledUp && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3">
          <Trophy className="h-5 w-5 text-amber-400 shrink-0" />
          <span className="text-sm font-semibold text-amber-400">
            Level Up! You&apos;re now Level {newLevel}
            {newLevel >= 3 ? " — Algorithm mode unlocked!" : ""}
          </span>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCell label="WPM" value={String(Math.round(solve.wpm))} highlight />
        <StatCell label="Accuracy" value={`${solve.accuracy.toFixed(1)}%`} />
        <StatCell
          label="Time"
          value={formatTime(Math.round(solve.elapsedTime))}
        />
        <StatCell label="Errors" value={String(solve.errors)} />
      </div>

      {/* Solve details */}
      <div className="flex flex-wrap gap-2">
        {solve.n && (
          <Badge variant="outline" className="font-mono text-xs capitalize">
            N = {solve.n}
          </Badge>
        )}
        {wasHidden && (
          <Badge
            variant="outline"
            className="gap-1 text-xs text-muted-foreground"
          >
            <EyeOff className="h-3 w-3" />
            Hidden mode bonus
          </Badge>
        )}
        <Badge variant="secondary" className="gap-1 text-xs">
          <CheckCircle2 className="h-3 w-3" />
          Completed
        </Badge>
      </div>

      {/* XP breakdown */}
      <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-card-foreground text-sm mb-2">
          XP Breakdown
        </p>
        <div className="flex justify-between">
          <span>Base ({challenge.difficulty})</span>
          <span className="font-mono">
            {challenge.difficulty === "easy"
              ? 10
              : challenge.difficulty === "medium"
                ? 25
                : 50}
          </span>
        </div>
        {solve.wpm >= 40 && (
          <div className="flex justify-between text-primary">
            <span>Speed bonus (≥40 WPM)</span>
            <span className="font-mono">
              ×{solve.wpm >= 80 ? "2.0" : solve.wpm >= 60 ? "1.5" : "1.2"}
            </span>
          </div>
        )}
        {solve.accuracy < 95 && (
          <div className="flex justify-between text-destructive">
            <span>Accuracy penalty (&lt;95%)</span>
            <span className="font-mono">
              ×{solve.accuracy >= 80 ? "0.8" : "0.6"}
            </span>
          </div>
        )}
        {wasHidden && (
          <div className="flex justify-between text-primary">
            <span>Hidden mode</span>
            <span className="font-mono">×1.5</span>
          </div>
        )}
        {solve.n && (
          <div className="flex justify-between">
            <span>N multiplier ({solve.n})</span>
            <span className="font-mono">
              ×
              {solve.n === "tiny"
                ? "1.0"
                : solve.n === "small"
                  ? "1.5"
                  : solve.n === "medium"
                    ? "2.0"
                    : "3.0"}
            </span>
          </div>
        )}
        <div className="flex justify-between font-semibold text-card-foreground border-t border-border pt-1 mt-1">
          <span>Total</span>
          <span className="font-mono text-primary">+{xpEarned} XP</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Button onClick={onPlayAgain} className="gap-2">
          <RotateCcw className="h-4 w-4" />
          Play Again
        </Button>
        <Button variant="outline" onClick={onChooseChallenge} className="gap-2">
          <XCircle className="h-4 w-4" />
          Choose Challenge
        </Button>
      </div>
    </div>
  )
}
