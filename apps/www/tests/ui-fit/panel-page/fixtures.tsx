/**
 * Every state the panel-fit sweep mounts (`../panel-fit.spec.ts`), by id.
 *
 * The registry's panels are mounted through `componentRegistry` itself, the
 * lazy entries a session binds, with no props beyond the one a session would
 * choose (hangul's mode). The TOPIK quiz stages are mounted through
 * `QuizPanel` one by one (`PANEL_STAGES` in the spec says why), and the
 * phone's drama through `DramaLesson`, opened at a state by a resume point.
 *
 * `planted-overflow` is not a panel. It is the sweep's self-test: a box that
 * fills its rect around content that cannot fit, so a harness that silently
 * measures nothing goes red.
 */

import type { ComponentProps, JSX } from "react"
import { componentRegistry } from "@some-ui/content-registry"
import { HANDHELD_MAX_HEIGHT } from "@some-ui/react-hooks"
import { SpeechProvider } from "@some-ui/speech"
import { webSpeech } from "@some-ui/speech/web-speech"
// This page is its own build (`build:fit`) and in no shipped bundle, so the
// eager edge the rule guards against costs nothing here, and the quiz stages
// are reachable through no lazy entry.
// eslint-disable-next-line lazy-registry/no-eager-registry-import
import { DramaLesson, intakeTree, lastDramaOf, QuizPanel } from "@some-ui/topik"

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

/**
 * A scene tree written to stress the phone's layout rather than to teach:
 * the root asks four long replies, the most a choice may offer, so the dock
 * is as full as a tree can make it.
 */
const STRESS_TREE = {
  id: "fit-tree",
  level: 3,
  pov: "seoyeon",
  cast: [
    { id: "seoyeon", name: "윤서연", standing: "the fiancée", registers: {} },
    {
      id: "chairman",
      name: "강 회장님",
      standing: "his mother",
      registers: {},
    },
  ],
  root: {
    id: "s1",
    place: "회장님 댁 거실, 결혼 이야기가 처음 나온 저녁",
    feeling: "fury",
    beats: [
      {
        id: "s1-n1",
        text: "서연이 처음으로 회장님 댁에 와서 거실 소파 끝에 조심스럽게 앉았다.",
        gloss: "Seo-yeon has come to the chairman's house for the first time.",
      },
      {
        id: "s1-l1",
        speaker: "chairman",
        text: "우리 집안에 들어오려면 그 정도 각오는 하고 왔겠지? 대답해 봐.",
        gloss: "You came ready for that, if you mean to join this family?",
        direction: "setting her cup down hard",
      },
    ],
    choice: {
      id: "c1",
      prompt: "서연은 회장님께 뭐라고 대답해야 할까?",
      check: {
        id: "c1-reply",
        kind: "pick-valid",
        order: 3,
        source: "우리 집안에 들어오려면 그 정도 각오는 하고 왔겠지? 대답해 봐.",
        prompt: "Which reply fits, to the chairman?",
        options: [
          {
            id: "a",
            text: "네, 회장님. 부족하지만 각오는 단단히 하고 왔습니다.",
            relation: "reply",
            valid: true,
            why: "Formal -습니다 answers an elder's challenge.",
          },
          {
            id: "b",
            text: "응, 당연하지. 그런 거 다 알고 왔어.",
            relation: "reply",
            valid: false,
            why: "반말 to an elder at a first meeting is rude.",
          },
          {
            id: "c",
            text: "글쎄요, 잘 모르겠는데요. 생각해 본 적이 없어서요.",
            relation: "reply",
            valid: false,
            why: "It dodges the question she asked.",
          },
          {
            id: "d",
            text: "회장님이야말로 각오는 하셨어요? 저도 쉽지 않거든요.",
            relation: "reply",
            valid: false,
            why: "Turning the question back on her is a challenge.",
          },
        ],
      },
      options: ["a", "b", "c", "d"].map((id) => ({
        id,
        child: {
          id: `s-${id}`,
          place: "회장님 댁 거실",
          feeling: id === "a" ? "warmth" : "chill",
          beats: [
            {
              id: `s-${id}-l1`,
              speaker: "chairman",
              text: "그래, 어디 한번 두고 보자. 말보다 행동이 중요한 법이니까.",
              gloss: "Fine, we shall see. Deeds matter more than words.",
            },
          ],
        },
      })),
    },
  },
}

const fitTree = ((): ComponentProps<typeof DramaLesson>["lesson"] => {
  const intake = intakeTree(JSON.stringify(STRESS_TREE))
  if (intake.status !== "checked") {
    throw new Error(`the fit tree no longer passes intake: ${intake.status}`)
  }
  return intake.lesson
})()

/**
 * The drama opened at `point`, in the box the handheld gives it: a flex
 * column under its header (44px on a phone held sideways, 56px otherwise).
 */
function dramaStage(
  point: Parameters<typeof lastDramaOf>[1]
): () => JSX.Element {
  const DramaStage = (): JSX.Element => {
    const short = window.innerHeight < HANDHELD_MAX_HEIGHT
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          minHeight: 0,
        }}
      >
        <div style={{ height: short ? 44 : 56, flexShrink: 0 }} />
        <DramaLesson
          lesson={fitTree}
          voice={null}
          sound={null}
          points={{ get: () => point, set: noop }}
          // The record an ending leaves, so an ending shows its review.
          last={{
            get: () => lastDramaOf(fitTree, point, null, Date.now()),
            save: noop,
          }}
          short={short}
          onLeave={noop}
        />
      </div>
    )
  }
  return DramaStage
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

  // The webtoon at its last beat, with the choice open (four options in the
  // dock), and at a leaf's ending.
  "topik-drama-beat": dramaStage({
    route: [],
    at: { kind: "beat", id: "s1-l1" },
    first: {},
  }),
  "topik-drama-choice": dramaStage({
    route: [],
    at: { kind: "choice" },
    first: {},
  }),
  "topik-drama-ending": dramaStage({
    route: ["d"],
    at: { kind: "end" },
    first: { c1: "d" },
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
