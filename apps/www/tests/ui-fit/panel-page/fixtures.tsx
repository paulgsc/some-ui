/**
 * Every state the panel-fit sweep mounts (`../panel-fit.spec.ts`), by id.
 *
 * The registry's panels are mounted through `componentRegistry` itself, the
 * lazy entries a session binds, with no props beyond the one a session would
 * choose (hangul's mode). The TOPIK quiz stages are mounted through
 * `QuizPanel` one by one (`PANEL_STAGES` in the spec says why).
 *
 * `planted-overflow` is not a panel. It is the sweep's self-test: a box that
 * fills its rect around content that cannot fit, so a harness that silently
 * measures nothing goes red.
 */

import type { ComponentProps, JSX } from "react"
import { componentRegistry } from "@some-ui/content-registry"
import { SpeechProvider } from "@some-ui/speech"
import { webSpeech } from "@some-ui/speech/web-speech"
// This page is its own build (`build:fit`) and in no shipped bundle, so the
// eager edge the rule guards against costs nothing here, and the quiz stages
// are reachable through no lazy entry.
// eslint-disable-next-line lazy-registry/no-eager-registry-import
import { QuizPanel } from "@some-ui/topik"

type QuizPanelProps = ComponentProps<typeof QuizPanel>
type Question = QuizPanelProps["questions"][number]

const MULTIPLE_CHOICE: Question = {
  type: "multiple-choice",
  korean: "안녕하세요",
  question: "What does this greeting mean?",
  options: ["Hello", "Goodbye", "Thank you"],
  correct: 0,
  correctAnswer: "Hello",
  explanation: "It's a standard greeting used any time of day.",
}

const TEXT_INPUT: Question = {
  type: "text-input",
  korean: "감사합니다",
  question: "Translate this phrase.",
  acceptedAnswers: ["thank you", "thanks"],
  correctAnswer: "thank you",
  explanation: "A common, polite phrase of gratitude.",
}

const noop = (): void => undefined

/** Mid-quiz on the first question; each stage below overrides what it needs. */
const QUIZ: QuizPanelProps = {
  quizStage: "question",
  currentQuestion: 0,
  totalQuestions: 5,
  questions: [MULTIPLE_CHOICE],
  onAnswerSubmit: noop,
  onNextQuestion: noop,
  onAssessmentComplete: noop,
  score: 0,
  feedbackData: null,
  chatPlayState: "paused",
  isInQuiz: true,
  isSpeaking: false,
  onSpeakMessage: noop,
}

function quizStage(stage: Partial<QuizPanelProps>): () => JSX.Element {
  const QuizStage = (): JSX.Element => <QuizPanel {...QUIZ} {...stage} />
  return QuizStage
}

const Hangul = componentRegistry.hangul.Component
const Leetype = componentRegistry.leetype.Component
const Topik = componentRegistry.topik.Component

export const PANEL_FIXTURES = {
  hangul: (): JSX.Element => <Hangul mode="endless" />,
  leetype: (): JSX.Element => <Leetype />,
  // A session has no companion services here, so speech is `static`: the
  // browser's own voice. The applet runs without a provider too, but its
  // controls are the ones a learner with speech sees.
  topik: (): JSX.Element => (
    <SpeechProvider
      config={{
        mode: "static",
        language: "korean",
        adapters: { static: webSpeech },
      }}
    >
      <Topik />
    </SpeechProvider>
  ),

  "topik-quiz-idle-playing": quizStage({
    isInQuiz: false,
    chatPlayState: "running",
  }),
  "topik-quiz-active-multiple-choice": quizStage({}),
  "topik-quiz-active-text-input": quizStage({
    currentQuestion: 2,
    questions: [MULTIPLE_CHOICE, MULTIPLE_CHOICE, TEXT_INPUT],
  }),
  "topik-quiz-feedback-incorrect-text-input": quizStage({
    quizStage: "feedback",
    currentQuestion: 3,
    feedbackData: {
      isCorrect: false,
      questionType: "text-input",
      userAnswer: "goodbye",
      correctAnswer: "thank you",
      explanation: "감사합니다 is a formal way to say thank you.",
      grammarNote: "The 습니다 ending marks formal speech.",
    },
  }),
  // 80% and up: the "Advanced" tier, passed.
  "topik-quiz-summary-advanced": quizStage({
    quizStage: "summary",
    score: 9,
    totalQuestions: 10,
  }),
  // Below 70%: "Beginner", failed, with a retry.
  "topik-quiz-summary-failed": quizStage({
    quizStage: "summary",
    score: 4,
    totalQuestions: 10,
  }),

  // Inline styles, not utilities: this directory is outside www's Tailwind
  // sources (style.context.ts), so the page adds nothing to the CSS it
  // measures.
  "planted-overflow": (): JSX.Element => (
    <div className="planted-panel" style={{ height: "100%" }}>
      <div style={{ height: 900 }}>too tall</div>
    </div>
  ),
} satisfies Record<string, () => JSX.Element>

export type PanelId = keyof typeof PANEL_FIXTURES

export function isPanelId(id: string | null): id is PanelId {
  return id !== null && Object.hasOwn(PANEL_FIXTURES, id)
}

export const PANEL_IDS: ReadonlyArray<PanelId> =
  Object.keys(PANEL_FIXTURES).filter(isPanelId)
