/**
 * Every state the ui-fit sweeps mount (`../panel-fit.spec.ts`, and
 * `../incident-fit.spec.ts` for the phone's incident session), by id.
 *
 * The panels are mounted through `PANELS` itself (`@/lib/playable`), the
 * lazy entries a session binds, with no props beyond the one a session would
 * choose (hangul's mode). This page builds the `lan` profile, so the web
 * surface's panels are among them. The TOPIK quiz stages are mounted through
 * `QuizPanel` one by one (`PANEL_STAGES` in the spec says why), and the
 * phone's drama through `DramaLesson`, opened at a state by a resume point.
 *
 * `planted-overflow` is not a panel. It is the sweep's self-test: a box that
 * fills its rect around content that cannot fit, so a harness that silently
 * measures nothing goes red.
 */

import type { ComponentProps, JSX } from "react"
import { HANDHELD_MAX_HEIGHT } from "@some-ui/react-hooks"
import { SpeechProvider } from "@some-ui/speech"
import { webSpeech } from "@some-ui/speech/web-speech"
import type { Dish, LessonItem, ReadAloudDeck } from "@some-ui/topik"
// This page is its own build (`build:fit`) and in no shipped bundle, so the
// eager edge the rule guards against costs nothing here, and the quiz stages
// are reachable through no lazy entry.
// eslint-disable-next-line lazy-registry/no-eager-registry-import
import {
  DramaLesson,
  intakeTree,
  lastDramaOf,
  MaterialList,
  PoolNote,
  PortionAsk,
  PortionServed,
  QuizPanel,
  RepCard,
  SetCard,
  SharePrompt,
} from "@some-ui/topik"

import { PANELS } from "@/lib/playable"

import { IncidentFixture } from "./incident"
import { JobsStatusFixture } from "./jobs-status"

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

/** A routine scene at `level` and `genre`, its read-aloud set opened or not. */
const fitScene = (
  at: number,
  level: number,
  genre: string,
  name: string,
  opened = false
): LessonItem => ({
  key: `scene/scene-${at}.json`,
  kind: "scene",
  name,
  level,
  genre,
  premise: undefined,
  opened,
  sessions: [
    { practice: "read-aloud", id: `set-${at}`, size: "12 words", opened },
    { practice: "lens", id: `set-${at}-lens`, size: "6 lines", opened: false },
  ],
})

/** More than the first few, at two levels: the search and the filter show. */
const FIT_ROUTINE: ReadonlyArray<LessonItem> = [
  {
    ...fitScene(0, 2, "comedy", "What is this test"),
    premise:
      "Two friends meet before the exam and argue about what it even tests.",
  },
  fitScene(1, 1, "thriller", "The clock keeps running"),
  fitScene(2, 2, "historical", "Rice cakes on the road"),
  fitScene(3, 2, "family", "Holiday food with grandmother", true),
  fitScene(4, 2, "makjang", "The same secret again", true),
  fitScene(5, 2, "revenge", "Where the stress goes", true),
  fitScene(6, 1, "romance", "A video lesson for two", true),
]

/**
 * A card in the box the handheld gives it: a flex column under its header
 * (44px on a phone held sideways, 56px otherwise).
 */
function handheldStage(
  card: (short: boolean) => JSX.Element
): () => JSX.Element {
  const HandheldStage = (): JSX.Element => {
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
        {card(short)}
      </div>
    )
  }
  return HandheldStage
}

/** The drama opened at `point`. */
const dramaStage = (
  point: Parameters<typeof lastDramaOf>[1]
): (() => JSX.Element) =>
  handheldStage((short) => (
    <DramaLesson
      lesson={fitTree}
      voice={null}
      sound={null}
      points={{ get: () => point, set: noop }}
      // The record an ending leaves, so an ending shows its review.
      last={{
        get: () => lastDramaOf(fitTree, point, null, Date.now()),
        save: noop,
        subscribe: () => noop,
      }}
      // The phone offers the next episode's share first in the dock.
      ending={
        <SharePrompt
          share={() => new Promise(noop)}
          label="다음 화 쓰기"
          labelLang="ko"
          prompt={() => ""}
          onShared={noop}
        />
      }
      short={short}
      onLeave={noop}
    />
  ))

/**
 * One level-3 line of twenty-six syllables, the longest a read-aloud sentence
 * is written, so the card's stage is as full as a line can make it.
 */
const READ_ALOUD_DECK: ReadAloudDeck = {
  id: "fit-read-aloud",
  title: "Fit",
  words: [
    { id: "bi", lemma: "비", gloss: "rain" },
    { id: "oda", lemma: "오다", gloss: "come" },
    { id: "eoje", lemma: "어제", gloss: "yesterday" },
    { id: "chingu", lemma: "친구", gloss: "friend" },
    { id: "mannada", lemma: "만나다", gloss: "meet" },
    { id: "mothada", lemma: "못하다", gloss: "be unable" },
    { id: "oneul", lemma: "오늘", gloss: "today" },
    { id: "kkok", lemma: "꼭", gloss: "surely" },
    { id: "geot", lemma: "것", gloss: "thing" },
  ],
  lines: [
    {
      id: "fit-line",
      level: 3,
      korean: "비가 와서 어제는 친구를 만나지 못했지만 오늘은 꼭 만날 거예요.",
      english:
        "It rained, so I couldn't meet my friend yesterday, but I will today.",
      words: [
        { wordId: "bi", surface: "비가", stemEnd: 1 },
        { wordId: "oda", surface: "와서", stemEnd: 1 },
        { wordId: "eoje", surface: "어제는", stemEnd: 2 },
        { wordId: "chingu", surface: "친구를", stemEnd: 2 },
        { wordId: "mannada", surface: "만나지", stemEnd: 2 },
        { wordId: "mothada", surface: "못했지만", stemEnd: 2 },
        { wordId: "oneul", surface: "오늘은", stemEnd: 2 },
        { wordId: "kkok", surface: "꼭", stemEnd: 1 },
        { wordId: "mannada", surface: "만날", stemEnd: 2 },
        { wordId: "geot", surface: "거예요", stemEnd: 1 },
      ],
    },
  ],
}

const FIT_LINE = READ_ALOUD_DECK.lines[0]

const FIT_SENTENCE: ComponentProps<typeof RepCard>["entry"]["item"] = {
  kind: "sentence",
  key: `s:${FIT_LINE.id}`,
  lineId: FIT_LINE.id,
  text: FIT_LINE.korean,
  syllables: 26,
  wordIds: [...new Set(FIT_LINE.words.map((word) => word.wordId))],
}

/** A snack of four of the deck's longest line, due again. */
const FIT_SNACK: Dish = {
  portion: "snack",
  key: "snack:fit:0",
  setId: READ_ALOUD_DECK.id,
  setTitle: READ_ALOUD_DECK.title,
  at: 0,
  lines: [0, 1, 2, 3].map((n) => ({
    id: `${FIT_LINE.id}-${n}`,
    korean: FIT_LINE.korean,
    english: FIT_LINE.english,
  })),
  fresh: { kind: "due", lastShown: "2026-10-12T12:00:00.000Z" },
}

// Unbound, it renders nothing, and the sweep fails on an empty panel.
const Hangul = PANELS.hangul?.Component ?? ((): null => null)
const Leetype = PANELS.leetype.Component
const Topik = PANELS.topik.Component

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

  // A sentence back after a stuck report, at its echo, with the reason and
  // the mark ("Seen before", the longest) beside the step's label and the
  // sitting's bar at the foot; and a set's summary once the sitting has
  // shown every sentence.
  "topik-read-aloud-return": handheldStage((short) => (
    <RepCard
      deck={READ_ALOUD_DECK}
      entry={{ item: FIT_SENTENCE, role: "return" }}
      step="echo"
      stepMs={6000}
      stepKey={1}
      reported={false}
      playing
      pool={{ shown: 31, of: 54 }}
      exposure={{ kind: "seen", onOpen: noop }}
      short={short}
      onStuck={noop}
      onSkip={noop}
      onResume={noop}
    />
  )),
  "topik-read-aloud-summary-full": handheldStage((short) => (
    <SetCard
      kind="summary"
      headline="10 read aloud"
      detail={<PoolNote pool={{ shown: 54, of: 54 }} />}
      runKey={1}
      short={short}
      onNext={noop}
      onStop={noop}
    />
  )),

  // The start screen at its fullest: the level's shortfall, the lens with its
  // full record, the practice record, and the sentence tally with its clear
  // control.
  "topik-read-aloud-ready": handheldStage((short) => (
    <SetCard
      kind="ready"
      level={3}
      audio
      resuming
      shortfall={2}
      record={{
        record: {
          version: 1,
          days: [
            { day: "2026-10-21", reps: 48, sets: 12, practiceMs: 1_800_000 },
          ],
          totals: { reps: 5300, sets: 1200, practiceMs: 20_000_000 },
        },
        today: "2026-10-21",
      }}
      tally={{
        size: 54,
        since: "2026-10-19T12:00:00.000Z",
        today: "2026-10-21",
        onClear: () => true,
      }}
      lens={{ available: true, full: true, onStart: noop }}
      short={short}
      onStart={noop}
      onStop={noop}
    />
  )),

  // The start screen with the routine's feed: more than the first few, so
  // the search shows, each scene a card with a session per set.
  "topik-routine-feed": handheldStage(() => (
    <MaterialList
      level={2}
      onLevel={noop}
      dramas={[]}
      onPlay={noop}
      onSeed={noop}
      loading={false}
      error={null}
      onReload={noop}
      fromRoutine={FIT_ROUTINE}
      onOpenRoutine={noop}
    />
  )),

  // "What are you hungry for?": the question screen, and `FIT_SNACK`.
  "topik-portion-ask": handheldStage((short) => (
    <PortionAsk
      order={{ portion: "meal", freshness: "seen" }}
      onOrder={noop}
      onServe={noop}
      short={short}
    />
  )),
  "topik-portion-served": handheldStage((short) => (
    <PortionServed
      order={{ portion: "snack", freshness: "either" }}
      dish={FIT_SNACK}
      now={new Date("2026-10-21T12:00:00.000Z")}
      onStart={noop}
      onAnother={noop}
      onChange={noop}
      short={short}
    />
  )),

  // The end of a sitting with both answers given: the longest saved line.
  "topik-read-aloud-sitting-over": handheldStage((short) => (
    <SetCard
      kind="sitting-over"
      feedback={{
        value: {
          tooEasy: { at: "2026-10-21T08:00:00.000Z" },
          tooManyRepeats: { at: "2026-10-21T08:05:00.000Z" },
        },
        kept: true,
        onToggle: noop,
      }}
      short={short}
      onContinue={noop}
      onStop={noop}
    />
  )),

  "leetype-incident": IncidentFixture,

  "jobs-status": JobsStatusFixture,

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
