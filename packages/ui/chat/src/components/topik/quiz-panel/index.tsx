import { QuizActive } from "@chat/components/topik/quiz-states/quiz-active"
import { QuizFeedback } from "@chat/components/topik/quiz-states/quiz-feedback"
import { QuizIdle } from "@chat/components/topik/quiz-states/quiz-idle"
import { QuizReady } from "@chat/components/topik/quiz-states/quiz-ready"
import { QuizSummary } from "@chat/components/topik/quiz-states/quiz-summary"
import type { ChatPlayState, Message } from "@chat/types/topik"

type QuizPanelProps = {
  state: "standby" | "ready" | "active" | "feedback" | "summary"
  currentQuestion: number
  totalQuestions: number
  questions: Array<{
    type: "multiple-choice" | "text-input"
    korean: string
    question: string
    options?: Array<string>
    correct?: number
    acceptedAnswers?: Array<string>
    correctAnswer: string
    explanation: string
    grammarNote?: string
  }>
  onStartQuiz: () => void
  onAnswerSubmit: (isCorrect: boolean, userAnswer: string) => void
  onNextQuestion: () => void
  onAssessmentComplete: (passed: boolean) => void
  onSpeakMessage: (message: Message) => void
  isSpeaking: boolean
  score: number
  feedbackData?: {
    isCorrect: boolean
    questionType: "multiple-choice" | "text-input"
    userAnswer?: string
    correctAnswer?: string
    explanation: string
    grammarNote?: string
  }
  chatPlayState: ChatPlayState
}

export const QuizPanel = ({
  state,
  currentQuestion,
  totalQuestions,
  questions,
  onStartQuiz,
  onAnswerSubmit,
  onNextQuestion,
  onAssessmentComplete,
  onSpeakMessage,
  isSpeaking,
  score,
  feedbackData,
  chatPlayState,
}: QuizPanelProps) => {
  return (
    <div className="h-full w-full">
      {state === "standby" && <QuizIdle chatPlayState={chatPlayState} />}
      {state === "ready" && <QuizReady onStartQuiz={onStartQuiz} />}
      {state === "active" && (
        <QuizActive
          questionNumber={currentQuestion + 1}
          totalQuestions={totalQuestions}
          question={questions[currentQuestion]}
          onAnswerSubmit={onAnswerSubmit}
          onSpeakMessage={onSpeakMessage}
          isSpeaking={isSpeaking}
        />
      )}
      {state === "feedback" && feedbackData && (
        <QuizFeedback
          isCorrect={feedbackData.isCorrect}
          onNextQuestion={onNextQuestion}
          questionNumber={currentQuestion + 1}
          totalQuestions={totalQuestions}
          questionType={feedbackData.questionType}
          userAnswer={feedbackData.userAnswer}
          correctAnswer={feedbackData.correctAnswer}
          explanation={feedbackData.explanation}
          grammarNote={feedbackData.grammarNote}
        />
      )}
      {state === "summary" && (
        <QuizSummary
          score={score}
          totalQuestions={totalQuestions}
          onAssessmentComplete={onAssessmentComplete}
        />
      )}
    </div>
  )
}
