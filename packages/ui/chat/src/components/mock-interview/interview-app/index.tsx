import { useState } from "react"
import { PreparationPhase } from "@chat/components/mock-interview/preparation-phase"
import { QuestionPlayback } from "@chat/components/mock-interview/question-playback"
import { RecordingPhase } from "@chat/components/mock-interview/recording-phase"
import { ReviewPhase } from "@chat/components/mock-interview/review-phase"
import { WelcomeScreen } from "@chat/components/mock-interview/welcome-screen"

// Mock interview questions
const mockQuestions = [
  {
    id: "q1",
    level: "mid",
    category: "system-design",
    question:
      "Design a URL shortening service like bit.ly. Consider scalability, database design, and API endpoints.",
    durationSeconds: 120,
  },
  {
    id: "q2",
    level: "mid",
    category: "behavioral",
    question:
      "Tell me about a time when you had to resolve a conflict within your team. How did you approach it?",
    durationSeconds: 90,
  },
  {
    id: "q3",
    level: "senior",
    category: "technical",
    question:
      "Explain how you would optimize a slow database query. What tools and techniques would you use?",
    durationSeconds: 100,
  },
]

type Phase = "welcome" | "question" | "preparation" | "recording" | "review"

export const InterviewApp = () => {
  const [phase, setPhase] = useState<Phase>("welcome")
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [transcript, setTranscript] = useState("")
  const [notes, setNotes] = useState("")
  const currentQuestion = mockQuestions[currentQuestionIndex]
  const isLastQuestion = currentQuestionIndex === mockQuestions.length - 1

  const handleStartInterview = (): void => {
    setPhase("question")
  }
  const handleQuestionComplete = (): void => {
    setPhase("preparation")
  }
  const handleStartRecording = () => {
    setPhase("recording")
  }
  const handleRecordingComplete = (recordedTranscript: string) => {
    setTranscript(recordedTranscript)
    setPhase("review")
  }
  const handleContinue = () => {
    if (isLastQuestion) {
      // Could show completion screen
      setPhase("welcome")
      setCurrentQuestionIndex(0)
      setTranscript("")
      setNotes("")
    } else {
      setCurrentQuestionIndex((prev) => prev + 1)
      setPhase("question")
      setTranscript("")
      setNotes("")
    }
  }
  const handleSkip = () => {
    if (!isLastQuestion) {
      setCurrentQuestionIndex((prev) => prev + 1)
      setPhase("question")
      setTranscript("")
      setNotes("")
    }
  }
  const handleRetry = () => {
    setPhase("preparation")
    setTranscript("")
  }
  return (
    <main className="min-h-screen bg-background">
      {phase === "welcome" && <WelcomeScreen onStart={handleStartInterview} />}
      {phase === "question" && (
        <QuestionPlayback
          question={currentQuestion}
          questionNumber={currentQuestionIndex + 1}
          totalQuestions={mockQuestions.length}
          onComplete={handleQuestionComplete}
        />
      )}
      {phase === "preparation" && (
        <PreparationPhase
          question={currentQuestion.question}
          notes={notes}
          onNotesChange={setNotes}
          onStartRecording={handleStartRecording}
        />
      )}
      {phase === "recording" && (
        <RecordingPhase
          question={currentQuestion.question}
          onComplete={handleRecordingComplete}
        />
      )}
      {phase === "review" && (
        <ReviewPhase
          transcript={transcript}
          onContinue={handleContinue}
          onRetry={handleRetry}
          isLastQuestion={isLastQuestion}
        />
      )}
    </main>
  )
}
