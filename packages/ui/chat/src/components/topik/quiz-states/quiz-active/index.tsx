import { useState } from "react"
import type { Message } from "@chat/lib/topik"
import { CheckCircle2, Volume2 } from "lucide-react"
import { Button, Card, Textarea } from "some-ui-shared"

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
              <div className="bg-gradient-to-r from-primary/5 to-accent/5 p-6 rounded-2xl border-l-4 border-primary">
                <div className="flex items-start justify-between gap-4">
                  <p className="text-2xl font-medium leading-relaxed text-foreground flex-1">
                    {question.korean}
                  </p>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      let nextId = 1
                      const msg_id = (nextId++).toString()
                      const msg: Message = {
                        id: msg_id,
                        role: "assistant",
                        content: "",
                        timestamp: "",
                        korean: question.korean ?? "",
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
            <h2 className="text-2xl font-bold leading-tight mb-6">
              {question?.question}
            </h2>

            {question?.type === "multiple-choice" ? (
              /* Answer Options */
              <div className="grid gap-3">
                {question.options?.map((option, index) => (
                  <button
                    key={index}
                    onClick={() => setSelected(index)}
                    className={`group flex items-center gap-4 w-full p-5 text-left border-2 rounded-xl transition-all ${
                      selected === index
                        ? "border-primary bg-primary/5 shadow-md"
                        : "border-border hover:border-primary/50 hover:bg-primary/5"
                    }`}
                  >
                    <div
                      className={`size-8 rounded-full border-2 flex items-center justify-center font-bold transition-all ${
                        selected === index
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border group-hover:border-primary"
                      }`}
                    >
                      {String.fromCharCode(65 + index)}
                    </div>
                    <span className="font-semibold text-lg flex-1">
                      {option}
                    </span>
                    {selected === index && (
                      <CheckCircle2 className="size-5 text-primary" />
                    )}
                  </button>
                ))}
              </div>
            ) : (
              /* Text Input */
              <div className="space-y-3">
                <Textarea
                  placeholder="Type your answer here..."
                  value={textAnswer}
                  onChange={(e) => setTextAnswer(e.target.value)}
                  className="min-h-[120px] text-lg resize-none"
                  onKeyDown={(e) => {
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
            size="lg"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full text-lg py-6"
          >
            Check Answer
          </Button>
        </div>
      </div>
    </Card>
  )
}
