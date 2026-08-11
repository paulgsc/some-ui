import { useState } from "react"
import { Button, Card, Textarea } from "@some-ui/shared"
import type { Message } from "@topik/lib/topik"
import { CheckCircle2, Volume2 } from "lucide-react"

type QuizActiveProps = {
  questionNumber: number
  totalQuestions: number
  question?: {
    type: "multiple-choice" | "text-input"
    korean: string
    question: string
    options?: Array<string>
    correct?: number
    acceptedAnswers?: Array<string>
    correctAnswer: string
    explanation: string
    grammarNote?: string
  }
  onSpeakMessage: (message: Message) => void
  isSpeaking: boolean
  onAnswerSubmit: (isCorrect: boolean, userAnswer: string) => void
}

export const QuizActive = ({
  questionNumber,
  totalQuestions,
  question,
  isSpeaking,
  onSpeakMessage,
  onAnswerSubmit,
}: QuizActiveProps): React.JSX.Element => {
  const [selected, setSelected] = useState<number | null>(null)
  const [textAnswer, setTextAnswer] = useState("")
  let nextId = 1

  const normalizeText = (text: string): string => {
    return text
      .toLowerCase()
      .trim()
      .replace(/[.,!?;:]/g, "")
  }

  const handleSubmit = (): void => {
    if (!question) return

    if (question.type === "multiple-choice" && selected !== null) {
      const userAnswer = question.options?.[selected] || ""
      onAnswerSubmit(selected === question.correct, userAnswer)
    } else if (question.type === "text-input" && textAnswer.trim()) {
      const normalized = normalizeText(textAnswer)
      const isCorrect =
        question.acceptedAnswers?.some(
          (answer) => normalizeText(answer) === normalized
        ) || false
      onAnswerSubmit(isCorrect, textAnswer)
    }
  }

  const canSubmit =
    question &&
    ((question.type === "multiple-choice" && selected !== null) ||
      (question.type === "text-input" && textAnswer.trim().length > 0))

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
          // scroll-intent: long-form — a question's Korean context, prompt and
          // options are as long as the material's author wrote them. The box
          // itself stays bounded (min-h-0 above); this is the declared last
          // rung of docs/ui-fit, not a fallback.
          "flex min-h-0 flex-1 flex-col overflow-auto p-4 sm:p-6"
        }
      >
        <div className="m-auto w-full max-w-2xl space-y-4 sm:space-y-6">
          {/* Question Header */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold text-primary tracking-widest uppercase">
              Question {questionNumber} of {totalQuestions}
            </span>
            <span className="text-xs text-muted-foreground">
              {question?.type === "multiple-choice"
                ? "Multiple Choice"
                : "Translation"}
            </span>
          </div>

          {/* Korean Context */}
          {question?.korean && (
            <div className="space-y-4">
              <div className="from-primary/5 to-accent/5 border-primary rounded-2xl border-l-4 bg-gradient-to-r p-4">
                <div className="flex items-start justify-between gap-4">
                  <p className="text-foreground min-w-0 flex-1 text-xl font-medium leading-relaxed">
                    {question.korean}
                  </p>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      const msg_id = (nextId++).toString()
                      const msg: Message = {
                        id: msg_id,
                        role: "assistant",
                        content: "",
                        timestamp: "",
                        korean: question.korean,
                        english: "",
                      }
                      onSpeakMessage(msg)
                    }}
                    disabled={isSpeaking}
                    className="flex-shrink-0"
                  >
                    <Volume2
                      className={`size-5 ${isSpeaking ? "text-primary animate-pulse" : ""}`}
                    />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Question */}
          <div>
            <h2 className="mb-4 text-xl font-bold leading-tight">
              {question?.question}
            </h2>

            {question?.type === "multiple-choice" ? (
              /* Answer Options */
              <div className="grid gap-3">
                {question.options?.map((option, index) => {
                  const optionLetter = String.fromCharCode(65 + index)
                  return (
                    <button
                      key={optionLetter}
                      onClick={() => setSelected(index)}
                      className={`group flex w-full items-center gap-3 rounded-xl border-2 p-3 text-left transition-all ${
                        selected === index
                          ? "border-primary bg-primary/5 shadow-md"
                          : "border-border hover:border-primary/50 hover:bg-primary/5"
                      }`}
                    >
                      <div
                        className={`flex size-7 shrink-0 items-center justify-center rounded-full border-2 font-bold transition-all ${
                          selected === index
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border group-hover:border-primary"
                        }`}
                      >
                        {optionLetter}
                      </div>
                      <span className="min-w-0 flex-1 font-semibold">
                        {option}
                      </span>
                      {selected === index && (
                        <CheckCircle2 className="size-5 text-primary" />
                      )}
                    </button>
                  )
                })}
              </div>
            ) : (
              /* Text Input */
              <div className="space-y-3">
                <Textarea
                  placeholder="Type your answer here..."
                  value={textAnswer}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    setTextAnswer(e.target.value)
                  }
                  className="min-h-[96px] resize-none"
                  onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
                    if (e.key === "Enter" && !e.shiftKey && canSubmit) {
                      e.preventDefault()
                      handleSubmit()
                    }
                  }}
                />
                <p className="text-sm text-muted-foreground">
                  Press Enter to submit, Shift+Enter for new line
                </p>
              </div>
            )}
          </div>

          {/* Submit Button */}
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full"
          >
            Check Answer
          </Button>
        </div>
      </div>
    </Card>
  )
}
