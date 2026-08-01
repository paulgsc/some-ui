import {
  CheckCircle2,
  RotateCcw,
  Target,
  TrendingUp,
  Trophy,
  XCircle,
} from "lucide-react"
import { Button, Card } from "@some-ui/shared"

type QuizSummaryProps = {
  score: number
  totalQuestions: number
  onAssessmentComplete: (passed: boolean) => void
}

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
    <Card className="h-full border-2 flex flex-col">
      <div className="flex-1 flex items-center justify-center p-12">
        <div className="w-full max-w-2xl space-y-8">
          {/* Trophy Icon */}
          <div className="text-center">
            <div
              className={`inline-flex items-center justify-center p-6 rounded-3xl ${
                passed
                  ? "bg-gradient-to-br from-green-500/20 to-accent/20"
                  : "bg-gradient-to-br from-destructive/20 to-orange-500/20"
              }`}
            >
              {passed ? (
                <Trophy className="size-20 text-green-500" />
              ) : (
                <Target className="size-20 text-destructive" />
              )}
            </div>
            <h2 className="text-4xl font-bold mt-6">
              {passed ? "Assessment Passed!" : "Keep Practicing!"}
            </h2>
            <p className="text-muted-foreground text-lg mt-2">
              {passed ? "Moving to next conversation" : "Review and try again"}
            </p>
          </div>

          {/* Score Card */}
          <div className="bg-gradient-to-br from-primary/5 to-accent/5 p-8 rounded-3xl border-2 text-center">
            <div className="text-7xl font-bold mb-2">
              {score}/{totalQuestions}
            </div>
            <div className="text-2xl text-muted-foreground mb-4">
              {percentage}% Accuracy
            </div>
            <div
              className={`inline-flex items-center gap-2 px-4 py-2 bg-background rounded-full ${color} font-bold`}
            >
              {passed ? (
                <CheckCircle2 className="size-5" />
              ) : (
                <XCircle className="size-5" />
              )}
              {level} Level
            </div>
          </div>

          {/* Feedback Message */}
          <div className="bg-muted/30 p-6 rounded-2xl border text-center">
            <p className="text-lg leading-relaxed">{message}</p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-card border rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-green-500">{score}</div>
              <div className="text-xs text-muted-foreground mt-1">Correct</div>
            </div>
            <div className="bg-card border rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-destructive">
                {totalQuestions - score}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Incorrect
              </div>
            </div>
            <div className="bg-card border rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-accent">
                {percentage}%
              </div>
              <div className="text-xs text-muted-foreground mt-1">Score</div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            {passed ? (
              <Button
                size="lg"
                onClick={() => onAssessmentComplete(true)}
                className="flex-1 text-lg py-6 bg-green-500 hover:bg-green-600"
              >
                <TrendingUp className="size-5 mr-2" />
                Continue to Next Conversation
              </Button>
            ) : (
              <Button
                size="lg"
                variant="outline"
                onClick={() => onAssessmentComplete(false)}
                className="flex-1 text-lg py-6"
              >
                <RotateCcw className="size-5 mr-2" />
                Retry Conversation
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}
