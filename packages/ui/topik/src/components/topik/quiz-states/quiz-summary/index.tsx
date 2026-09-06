import { Button, Card, TALL_WINDOW_ONLY } from "@some-ui/shared"
import {
  CheckCircle2,
  RotateCcw,
  Target,
  TrendingUp,
  Trophy,
  XCircle,
} from "lucide-react"
import { cn } from "some-ui-utils"

type QuizSummaryProps = {
  score: number
  totalQuestions: number
  onAssessmentComplete: (passed: boolean) => void
}

/**
 * The end-of-batch result.
 *
 * This is the stage that produced #899: at `p-12`, `text-7xl` and `space-y-8`
 * it asked for roughly 950px of height inside a pane that the session viewport
 * had granted around 340, and painted the difference over whatever the layout
 * had put below it. Every size here is therefore chosen against the shortest
 * pane this applet is rendered into rather than against the tallest - the
 * panel-fit gate (apps/www/tests/ui-fit/panel-fit.spec.ts) is what holds it
 * there.
 */
export const QuizSummary = ({
  score,
  totalQuestions,
  onAssessmentComplete,
}: QuizSummaryProps): React.JSX.Element => {
  const percentage = Math.round((score / totalQuestions) * 100)
  const passed = percentage >= 70

  let level = "Beginner"
  let message = "Keep practicing! Review the conversation and try again."
  let color = "text-destructive"

  if (percentage >= 80) {
    level = "Advanced"
    message = "Excellent work! Your Korean comprehension is outstanding."
    color = "text-green-500"
  } else if (percentage >= 70) {
    level = "Intermediate"
    message = "Good progress! You're understanding the context well."
    color = "text-accent"
  }

  return (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden border-2">
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-lg space-y-3 sm:space-y-4">
          {/* Verdict */}
          <div className="flex items-center justify-center gap-3">
            <div
              className={cn(
                "inline-flex shrink-0 items-center justify-center rounded-2xl p-2.5",
                passed
                  ? "bg-gradient-to-br from-green-500/20 to-accent/20"
                  : "bg-gradient-to-br from-destructive/20 to-orange-500/20"
              )}
            >
              {passed ? (
                <Trophy className="size-8 text-green-500" />
              ) : (
                <Target className="text-destructive size-8" />
              )}
            </div>
            <div>
              <h2 className="text-xl font-bold leading-tight sm:text-2xl">
                {passed ? "Assessment Passed!" : "Keep Practicing!"}
              </h2>
              <p className="text-muted-foreground text-sm">
                {passed
                  ? "Moving to next conversation"
                  : "Review and try again"}
              </p>
            </div>
          </div>

          {/* Score */}
          <div className="from-primary/5 to-accent/5 rounded-2xl border-2 bg-gradient-to-br p-4 text-center">
            <div className="flex items-baseline justify-center gap-2">
              <span className="text-4xl font-bold leading-none">
                {score}/{totalQuestions}
              </span>
              <span className="text-muted-foreground text-base">
                {percentage}% Accuracy
              </span>
            </div>
            <div
              className={cn(
                "bg-background mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold",
                color
              )}
            >
              {passed ? (
                <CheckCircle2 className="size-4" />
              ) : (
                <XCircle className="size-4" />
              )}
              {level} Level
            </div>
          </div>

          {/* Feedback message: commentary, and the first thing to go when the
              window is short. On a phone held sideways this sentence wraps to
              two lines and takes ~40px of a 390px window - which is the whole
              of the 6px this panel was overflowing by, plus room to spare. It
              says nothing the score above and the verdict below do not
              already say; it says it more warmly, which is worth 40px of a
              tall window and not of a short one. */}
          <p
            className={cn(
              "text-muted-foreground text-center text-sm leading-relaxed",
              TALL_WINDOW_ONLY
            )}
          >
            {message}
          </p>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-card rounded-xl border p-2 text-center">
              <div className="text-lg font-bold text-green-500">{score}</div>
              <div className="text-muted-foreground text-xs">Correct</div>
            </div>
            <div className="bg-card rounded-xl border p-2 text-center">
              <div className="text-destructive text-lg font-bold">
                {totalQuestions - score}
              </div>
              <div className="text-muted-foreground text-xs">Incorrect</div>
            </div>
            <div className="bg-card rounded-xl border p-2 text-center">
              <div className="text-accent text-lg font-bold">{percentage}%</div>
              <div className="text-muted-foreground text-xs">Score</div>
            </div>
          </div>

          {/* Action */}
          {passed ? (
            <Button
              onClick={() => onAssessmentComplete(true)}
              className="w-full bg-green-500 hover:bg-green-600"
            >
              <TrendingUp className="mr-2 size-4" />
              Continue to Next Conversation
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={() => onAssessmentComplete(false)}
              className="w-full"
            >
              <RotateCcw className="mr-2 size-4" />
              Retry Conversation
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}
