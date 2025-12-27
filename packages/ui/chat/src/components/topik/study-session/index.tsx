import { useEffect, useState } from "react"
import { ChatPanel } from "@chat/components/topik/chat-panel"
import { QuizPanel } from "@chat/components/topik/quiz-panel"
import { SessionHeader } from "@chat/components/topik/session-header"

const conversationBatches = [
  {
    id: 1,
    messages: [
      {
        id: "1",
        role: "assistant" as const,
        content: "👋 안녕하세요! 무엇을 도와드릴까요?",
        timestamp: "18:15",
        korean: "안녕하세요! 무엇을 도와드릴까요?",
        english: "Hello! How can I help you?",
      },
      {
        id: "2",
        role: "user" as const,
        content: "그냥 구경하고 있어요!",
        timestamp: "18:15",
        korean: "그냥 구경하고 있어요!",
        english: "I'm just looking around!",
      },
      {
        id: "3",
        role: "assistant" as const,
        content:
          "네, 알겠습니다.\n\n도움이 필요하시면 언제든지 아래에 질문을 남겨주세요 👇",
        timestamp: "18:15",
        korean:
          "네, 알겠습니다. 도움이 필요하시면 언제든지 아래에 질문을 남겨주세요",
        english:
          "Yes, I understand. Please leave a question below if you need help",
      },
    ],
    questions: [
      {
        type: "multiple-choice" as const,
        korean: '"안녕하세요! 무엇을 도와드릴까요?"',
        question: 'What does "도와드릴까요" mean?',
        options: [
          "Can I help you?",
          "Where are you going?",
          "What do you want?",
          "Who are you?",
        ],
        correct: 0,
        correctAnswer: "Can I help you?",
        explanation:
          "도와드리다 is the honorific form of 돕다 (to help). Adding -ㄹ까요? makes it a polite offer.",
        grammarNote:
          'The pattern "verb stem + -ㄹ까요?" is used to make polite suggestions or offers.',
      },
      {
        type: "text-input" as const,
        korean: '"그냥 구경하고 있어요!"',
        question: "Translate this sentence to English:",
        acceptedAnswers: [
          "im just looking around",
          "just looking around",
          "im just browsing",
          "just browsing",
          "im just looking",
        ],
        correctAnswer: "I'm just looking around!",
        explanation:
          '그냥 means "just" and 구경하다 means "to look around" or "to browse". The -고 있어요 ending indicates present progressive.',
        grammarNote:
          "구경하다 is commonly used when browsing in stores or viewing things casually.",
      },
    ],
  },
  {
    id: 2,
    messages: [
      {
        id: "4",
        role: "user" as const,
        content:
          "사실, '스트림 아카이브' 섹션에 대해 궁금한 게 있어요. 좀... 독특하네요.",
        timestamp: "18:15",
        korean:
          "사실, '스트림 아카이브' 섹션에 대해 궁금한 게 있어요. 좀... 독특하네요.",
        english:
          "Actually, I'm curious about the 'Stream Archive' section. It's... unique.",
      },
      {
        id: "5",
        role: "assistant" as const,
        content:
          "아, 그거요. 지극히 개인적인 것들이죠. 공공장소에 남겨둔 '디지털 메모'라고 생각하시면 됩니다.",
        timestamp: "18:15",
        korean:
          "아, 그거요. 지극히 개인적인 것들이죠. 공공장소에 남겨둔 '디지털 메모'라고 생각하시면 됩니다.",
        english:
          "Ah, that. They're extremely personal things. Think of them as 'digital notes' left in a public space.",
      },
    ],
    questions: [
      {
        type: "multiple-choice" as const,
        korean: '"지극히 개인적인 것들이죠."',
        question: 'What does "지극히" mean in this context?',
        options: ["Extremely", "Slightly", "Rarely", "Obviously"],
        correct: 0,
        correctAnswer: "Extremely",
        explanation:
          '지극히 (ji-geuk-hi) means "extremely" or "exceedingly" - a TOPIK 4 level adverb that intensifies adjectives.',
        grammarNote:
          'The pattern "지극히 + adjective" is commonly used in formal writing and speech.',
      },
      {
        type: "text-input" as const,
        korean: '"궁금한 게 있어요"',
        question: "What does this phrase mean in English?",
        acceptedAnswers: [
          "i have a question",
          "im curious about something",
          "i have something im curious about",
          "theres something im curious about",
          "i wonder about something",
        ],
        correctAnswer: "I have something I'm curious about",
        explanation:
          "궁금하다 means 'to be curious' and -ㄴ 게 있다 means 'there is something that...'",
        grammarNote:
          "This is a common pattern for expressing curiosity or questions politely.",
      },
    ],
  },
  {
    id: 3,
    messages: [
      {
        id: "6",
        role: "user" as const,
        content: "그럼 시청자들을 위해 만든 게 아니라는 뜻인가요?",
        timestamp: "18:16",
        korean: "그럼 시청자들을 위해 만든 게 아니라는 뜻인가요?",
        english: "So you mean it wasn't made for viewers?",
      },
      {
        id: "7",
        role: "assistant" as const,
        content:
          "정확합니다. 누군가 우연히 발견해서 유용한 정보를 얻는다면 다행이지만, 구조나 소통을 보장하지는 않거든요. 저 자신을 위한 흔적을 남기는 것에 가깝죠.",
        timestamp: "18:16",
        korean:
          "정확합니다. 누군가 우연히 발견해서 유용한 정보를 얻는다면 다행이지만, 구조나 소통을 보장하지는 않거든요.",
        english:
          "Exactly. If someone happens to find it and gets useful information, that's great, but I don't guarantee structure or communication.",
      },
    ],
    questions: [
      {
        type: "multiple-choice" as const,
        korean: '"구조나 소통을 보장하지는 않거든요."',
        question: 'Why is "-거든요" used here?',
        options: [
          "To provide a reason or explanation",
          "To ask a question",
          "To make a polite request",
          "To express uncertainty",
        ],
        correct: 0,
        correctAnswer: "To provide a reason or explanation",
        explanation:
          "-거든요 is a sentence ending that explains a reason or background information to the listener, often for something they don't know.",
        grammarNote:
          "This ending is used when providing context that the listener wasn't aware of.",
      },
      {
        type: "text-input" as const,
        korean: '"우연히 발견해서"',
        question: "What does this phrase mean?",
        acceptedAnswers: [
          "happen to find",
          "find by chance",
          "accidentally discover",
          "stumble upon",
          "discover by accident",
        ],
        correctAnswer: "happen to find / find by chance",
        explanation:
          "우연히 means 'by chance' or 'accidentally', and 발견하다 means 'to discover' or 'to find'.",
        grammarNote:
          "The -해서 ending connects this phrase to the following clause, indicating cause or sequence.",
      },
    ],
  },
]

export const KoreanStudyPage = () => {
  const [currentBatchIndex, setCurrentBatchIndex] = useState(0)
  const [chatPlayState, setChatPlayState] = useState<
    "playing" | "paused" | "finished"
  >("paused")
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0)

  const [quizState, setQuizState] = useState<
    "standby" | "ready" | "active" | "feedback" | "summary"
  >("standby")
  const [currentQuestion, setCurrentQuestion] = useState(0)
  const [score, setScore] = useState(0)
  const [timeRemaining, setTimeRemaining] = useState(1200)
  const [feedbackData, setFeedbackData] = useState<{
    isCorrect: boolean
    questionType: "multiple-choice" | "text-input"
    userAnswer?: string
    correctAnswer?: string
    explanation: string
    grammarNote?: string
  } | null>(null)

  const currentBatch = conversationBatches[currentBatchIndex]
  const totalBatches = conversationBatches.length

  useEffect(() => {
    if (
      chatPlayState === "playing" &&
      currentMessageIndex < currentBatch.messages.length
    ) {
      const timer = setTimeout(() => {
        setCurrentMessageIndex((prev) => prev + 1)
      }, 2000) // 2 seconds per message
      return () => clearTimeout(timer)
    } else if (
      chatPlayState === "playing" &&
      currentMessageIndex >= currentBatch.messages.length
    ) {
      setChatPlayState("finished")
      setQuizState("ready")
    }
  }, [chatPlayState, currentMessageIndex, currentBatch.messages.length])

  const handleStartChat = () => {
    setChatPlayState("playing")
    setCurrentMessageIndex(0)
  }

  const handlePauseChat = () => {
    setChatPlayState("paused")
  }

  const handleResetChat = () => {
    setChatPlayState("paused")
    setCurrentMessageIndex(0)
    setQuizState("standby")
  }

  const handleStartQuiz = () => {
    setQuizState("active")
    setCurrentQuestion(0)
  }

  const handleAnswerSubmit = (isCorrect: boolean, userAnswer?: string) => {
    if (isCorrect) {
      setScore((prev) => prev + 1)
    }

    const currentQ = currentBatch.questions[currentQuestion]
    setFeedbackData({
      isCorrect,
      questionType: currentQ.type,
      userAnswer,
      correctAnswer: currentQ.correctAnswer,
      explanation: currentQ.explanation,
      grammarNote: currentQ.grammarNote,
    })
    setQuizState("feedback")
  }

  const handleNextQuestion = () => {
    if (currentQuestion < currentBatch.questions.length - 1) {
      setCurrentQuestion((prev) => prev + 1)
      setQuizState("active")
    } else {
      setQuizState("summary")
    }
  }

  const handleAssessmentComplete = (passed: boolean) => {
    if (passed) {
      // Move to next batch
      if (currentBatchIndex < conversationBatches.length - 1) {
        setCurrentBatchIndex((prev) => prev + 1)
        setCurrentMessageIndex(0)
        setChatPlayState("paused")
        setQuizState("standby")
        setCurrentQuestion(0)
      } else {
        // All batches completed
        setQuizState("summary")
      }
    } else {
      // Retry current batch
      setCurrentMessageIndex(0)
      setChatPlayState("paused")
      setQuizState("standby")
      setCurrentQuestion(0)
    }
  }

  const handleJumpToMessage = (index: number) => {
    setCurrentMessageIndex(index)
  }

  return (
    <div className="absolute inset-0 topik flex flex-col bg-background">
      <SessionHeader
        timeRemaining={timeRemaining}
        score={score}
        totalQuestions={currentBatch.questions.length}
        currentBatch={currentBatchIndex + 1}
        totalBatches={totalBatches}
        onEndSession={() => setQuizState("summary")}
      />

      <div className="flex-1 flex gap-4 p-4 overflow-hidden">
        <div className="w-80 xl:w-96 flex-shrink-0">
          <ChatPanel
            messages={currentBatch.messages}
            currentMessageIndex={currentMessageIndex}
            playState={chatPlayState}
            onPlay={handleStartChat}
            onPause={handlePauseChat}
            onReset={handleResetChat}
            onJumpToMessage={handleJumpToMessage}
            isQuizActive={quizState !== "standby"}
          />
        </div>

        <div className="flex-1">
          <QuizPanel
            state={quizState}
            currentQuestion={currentQuestion}
            totalQuestions={currentBatch.questions.length}
            questions={currentBatch.questions}
            onStartQuiz={handleStartQuiz}
            onAnswerSubmit={handleAnswerSubmit}
            onNextQuestion={handleNextQuestion}
            onAssessmentComplete={handleAssessmentComplete}
            score={score}
            feedbackData={feedbackData || undefined}
            chatPlayState={chatPlayState}
          />
        </div>
      </div>
    </div>
  )
}
