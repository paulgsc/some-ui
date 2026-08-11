import { Button, Card } from "@some-ui/shared"
import { ArrowRight, BookMarked, CheckCircle2, XCircle } from "lucide-react"

type QuizFeedbackProps = {
  isCorrect: boolean
  onNextQuestion: () => void
  questionNumber: number
  totalQuestions: number
  questionType: "multiple-choice" | "text-input"
  userAnswer?: string
  correctAnswer?: string
  explanation: string
  grammarNote?: string
}

export const QuizFeedback = ({
  isCorrect,
  onNextQuestion,
  questionNumber,
  totalQuestions,
  questionType,
  userAnswer,
  correctAnswer,
  explanation,
  grammarNote,
}: QuizFeedbackProps): React.JSX.Element => {
  return (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden border-2">
      {/* Progress Bar */}
      <div className="bg-muted h-2 w-full shrink-0">
        <div
          className="bg-primary h-full transition-all duration-500"
          style={{ width: `${(questionNumber / totalQuestions) * 100}%` }}
        />
      </div>

      <div
        data-scroll-intent="long-form"
        className={
          // scroll-intent: long-form — the explanation and grammar note are as
          // long as the material's author wrote them. The box stays bounded
          // (min-h-0 above); this is the declared last rung of docs/ui-fit.
          "flex min-h-0 flex-1 flex-col overflow-auto p-4 sm:p-6"
        }
      >
        <div className="m-auto w-full max-w-2xl space-y-4 sm:space-y-6">
          {/* Result Icon */}
          <div className="text-center">
            <div
              className={`inline-flex items-center justify-center rounded-3xl p-3 ${
                isCorrect ? "bg-success/10" : "bg-destructive/10"
              }`}
            >
              {isCorrect ? (
                <CheckCircle2 className="text-success size-10" />
              ) : (
                <XCircle className="text-destructive size-10" />
              )}
            </div>
            <h2 className="mt-3 text-2xl font-bold">
              {isCorrect ? "Correct!" : "Not Quite"}
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              {isCorrect
                ? "Great understanding of the context!"
                : "Let's review this concept"}
            </p>
          </div>

          {!isCorrect && questionType === "text-input" && (
            <div className="grid gap-4">
              <div className="bg-destructive/10 p-4 rounded-xl border border-destructive/20">
                <p className="text-xs font-bold text-destructive uppercase tracking-wide mb-2">
                  Your Answer
                </p>
                <p className="text-lg">{userAnswer}</p>
              </div>
              <div className="bg-success/10 p-4 rounded-xl border border-success/20">
                <p className="text-xs font-bold text-success uppercase tracking-wide mb-2">
                  Correct Answer
                </p>
                <p className="text-lg font-semibold">{correctAnswer}</p>
              </div>
            </div>
          )}

          {/* Explanation Card */}
          <div className="bg-muted/30 space-y-3 rounded-2xl border p-4">
            <div className="text-primary flex items-center gap-2 text-sm font-bold uppercase tracking-wide">
              <BookMarked className="size-4" />
              Explanation
            </div>
            <p className="text-sm leading-relaxed">{explanation}</p>
            {grammarNote && (
              <div className="pt-2 border-t">
                <p className="text-sm text-muted-foreground italic">
                  💡 {grammarNote}
                </p>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button onClick={onNextQuestion} className="min-w-0 flex-1">
              {questionNumber < totalQuestions ? (
                <>
                  Next Question
                  <ArrowRight className="ml-2 size-4" />
                </>
              ) : (
                <>
                  View Results
                  <ArrowRight className="ml-2 size-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  )
}
