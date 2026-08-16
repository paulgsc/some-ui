import type { FC } from "react"
import type { CompletedSessionStats } from "@leetype/types/leetype"
import { Button, Card } from "@some-ui/shared"
import { CheckCircle2, RotateCcw } from "lucide-react"
import { cn } from "some-ui-utils"

type ResultsCardProps = {
  exerciseTitle: string
  stats: CompletedSessionStats
  onPlayAgain: () => void
  className?: string
}

type StatCellProps = {
  label: string
  value: string
  hint?: string
  highlight?: boolean
}

const StatCell: FC<StatCellProps> = ({ label, value, hint, highlight }) => (
  <Card className="flex flex-col items-center gap-1 border-border bg-card p-4">
    <span className="text-xs text-muted-foreground">{label}</span>
    <span
      className={cn(
        "font-mono text-2xl font-bold",
        highlight ? "text-primary" : "text-card-foreground"
      )}
    >
      {value}
    </span>
    {hint && (
      <span className="text-center text-[0.65rem] text-muted-foreground">
        {hint}
      </span>
    )}
  </Card>
)

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const rest = Math.floor(seconds % 60)
  return `${minutes}:${rest.toString().padStart(2, "0")}`
}

/**
 * What a finished sequence reports.
 *
 * Reshaped around what the new story actually measures. There is no XP, no
 * level and no display mode here, because none of those exist any more: the
 * figures are how fast the player typed, how much of it they were shown, and
 * where the gate held.
 *
 * "Carried" is the one worth stating plainly rather than hiding. A step the
 * repeat cap let the player past is not a step they cleared, and reporting
 * the two as the same number would make the gate decorative.
 *
 * # The line a future stat cell must not cross (LTY-SEAM S2, #1016)
 *
 * Every figure here describes *this session's typing* — a rate, a
 * duration, a count, a fraction revealed. None of them describes *the
 * learner*: there is no mastery percentage, no level, no per-concept
 * score, because none of those claims is being made this milestone
 * (`adaptive-learning-canon.typ` Cor. 4.3, `p_credited = "false"`). A stat
 * cell added here later must pass the same test `stepsEscaped` already
 * does: it reports what happened, honestly, and stops short of saying
 * what it means about who the player is.
 */
export const ResultsCard: FC<ResultsCardProps> = ({
  exerciseTitle,
  stats,
  onPlayAgain,
  className,
}) => (
  <div className={cn("flex flex-col gap-6", className)}>
    <div className="flex items-start justify-between gap-4">
      <div className="flex flex-col gap-1">
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          Exercise complete
        </span>
        <h2 className="text-xl font-semibold text-card-foreground">
          {exerciseTitle}
        </h2>
      </div>
      <Button onClick={onPlayAgain} variant="secondary" className="gap-2">
        <RotateCcw className="h-4 w-4" />
        Again
      </Button>
    </div>

    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <StatCell label="WPM" value={String(stats.wpm)} highlight />
      <StatCell label="Accuracy" value={`${stats.accuracy.toFixed(1)}%`} />
      <StatCell label="Time" value={formatTime(stats.elapsedTime)} />
      <StatCell
        label="Steps"
        value={String(stats.stepsCompleted)}
        hint={
          stats.stepsEscaped > 0 ? `${stats.stepsEscaped} carried` : undefined
        }
      />
      <StatCell
        label="Revealed"
        value={`${Math.round(stats.assistance * 100)}%`}
        hint="of what you typed"
      />
      <StatCell label="Errors" value={String(stats.errors)} />
    </div>
  </div>
)
