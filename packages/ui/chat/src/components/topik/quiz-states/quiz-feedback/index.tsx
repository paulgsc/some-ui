import { ArrowRight, BookMarked, CheckCircle2, XCircle } from "lucide-react"
import { Button, Card } from "some-ui-shared"

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
    <Card className="h-full border-2 flex flex-col">
      {/* Progress Bar */}
      <div className="h-2 w-full bg-muted">
        <div
          className="h-full bg-primary transition-all duration-500"
          style={{ width: `${(questionNumber / totalQuestions) * 100}%` }}
        />
      </div>

      <div className="flex-1 flex items-center justify-center p-12 overflow-auto">
        <div className="w-full max-w-2xl space-y-8">
          {/* Result Icon */}
          <div className="text-center">
            <div
              className={`inline-flex items-center justify-center p-6 rounded-3xl ${
                isCorrect ? "bg-success/10" : "bg-destructive/10"
              }`}
            >
              {isCorrect ? (
                <CheckCircle2 className="size-20 text-success" />
              ) : (
                <XCircle className="size-20 text-destructive" />
              )}
            </div>
            <h2 className="text-4xl font-bold mt-6">
              {isCorrect ? "Correct!" : "Not Quite"}
            </h2>
            <p className="text-muted-foreground text-lg mt-2">
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
          <div className="bg-muted/30 p-6 rounded-2xl space-y-4 border">
            <div className="flex items-center gap-2 text-primary font-bold text-sm uppercase tracking-wide">
              <BookMarked className="size-4" />
              Explanation
            </div>
            <p className="text-base leading-relaxed">{explanation}</p>
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
            <Button
              size="lg"
              onClick={onNextQuestion}
              className="flex-1 text-lg py-6"
            >
              {questionNumber < totalQuestions ? (
                <>
                  Next Question
                  <ArrowRight className="size-5 ml-2" />
                </>
              ) : (
                <>
                  View Results
                  <ArrowRight className="size-5 ml-2" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  )
}
