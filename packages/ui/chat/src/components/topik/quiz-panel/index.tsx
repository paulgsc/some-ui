
import type { JSX } from "react"
import { QuizActive } from "@chat/components/topik/quiz-states/quiz-active"
import { QuizFeedback } from "@chat/components/topik/quiz-states/quiz-feedback"
import { QuizIdle } from "@chat/components/topik/quiz-states/quiz-idle"
import { QuizSummary } from "@chat/components/topik/quiz-states/quiz-summary"
import type { Message, Question } from "@chat/lib/topik"
import type { FeedbackData, PlayState, QuizStage } from "@chat/lib/topik"

type QuizPanelProps = {
  quizStage: QuizStage
  currentQuestion: number
  totalQuestions: number
  questions: Array<Question>
  onAnswerSubmit: (isCorrect: boolean, userAnswer: string) => void
  onNextQuestion: () => void
  onAssessmentComplete: (passed: boolean) => void
  score: number
  feedbackData: FeedbackData | null
  chatPlayState: PlayState
  isInQuiz: boolean
  isSpeaking: boolean
  onSpeakMessage: (message: Message) => void
}

export const QuizPanel = ({
  quizStage,
  currentQuestion,
  totalQuestions,
  questions,
  onAnswerSubmit,
  onNextQuestion,
  onAssessmentComplete,
  score,
  feedbackData,
  chatPlayState,
  isInQuiz,
  isSpeaking,
  onSpeakMessage,
}: QuizPanelProps): JSX.Element => {
  const activeQuestion = questions[currentQuestion]

  return (
    <div className="h-full w-full">
      {/* STANDBY: Not in quiz mode */}
      {!isInQuiz && <QuizIdle chatPlayState={chatPlayState} />}

      {/* QUESTION: Active question display */}
      {isInQuiz && quizStage === "question" && activeQuestion && (
        <QuizActive
          questionNumber={currentQuestion + 1}
          totalQuestions={totalQuestions}
          question={activeQuestion}
          onAnswerSubmit={onAnswerSubmit}
          onSpeakMessage={onSpeakMessage}
          isSpeaking={isSpeaking}
        />
      )}

      {/* FEEDBACK: Answer result */}
      {isInQuiz && quizStage === "feedback" && feedbackData && (
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

      {/* SUMMARY: Final results */}
      {isInQuiz && quizStage === "summary" && (
        <QuizSummary
          score={score}
          totalQuestions={totalQuestions}
          onAssessmentComplete={onAssessmentComplete}
        />
      )}
    </div>
  )
}
