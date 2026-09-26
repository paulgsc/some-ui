/**
 * The handheld renderer's view model.
 *
 * Orthogonal to `useSession` on purpose. The desktop machine's hydration
 * starts a countdown and begins auto-playing the whole conversation; on a
 * phone that is the wrong lesson, not merely the wrong layout (adaptive-
 * learning canon Cor. 9.1). This hook shares the desktop surface's
 * *repositories* - the same catalogue and topik files, through the same
 * TanStack cache - and nothing else: the step logic is the pure
 * `lesson-track` reducer, and speech goes straight to the adapter.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { SpeechAdapter } from "@some-ui/speech"
import type {
  ConversationBatch,
  Message,
  TopikMetadata,
} from "@topik/lib/topik"
import { useSessionConfig } from "@topik/lib/topik"
import type { ResumeStore } from "@topik/lib/topik/adapter/resume-point"
import { createResumeStore } from "@topik/lib/topik/adapter/resume-point"
import { useTopikMetadataList } from "@topik/lib/topik/adapter/server/topik-metadata-queries"
import { useTopikBatches } from "@topik/lib/topik/adapter/server/topik-queries"
import type { SurveyStore } from "@topik/lib/topik/adapter/survey-store"
import { createSurveyStore } from "@topik/lib/topik/adapter/survey-store"
import type {
  LessonSurvey,
  StuckCandidate,
} from "@topik/lib/topik/core/lesson-survey"
import { stuckCandidates } from "@topik/lib/topik/core/lesson-survey"
import type {
  LessonContext,
  LessonEvent,
  LessonPlan,
  LessonState,
  LessonStep,
  LessonTally,
  RevealLevel,
} from "@topik/lib/topik/core/lesson-track"
import {
  createLessonState,
  currentStep,
  glossUnlocked,
  lessonReducer,
  outcomesOf,
  planConversation,
  progressOf,
  revealCap,
  tallyOf,
} from "@topik/lib/topik/core/lesson-track"

const EMPTY_PLAN: LessonPlan = { steps: [], lineCount: 0, checkCount: 0 }
const SPOKEN_LANGUAGE = "ko"

export type HandheldLessonView = {
  topikKey: string
  displayName: string
  batch: ConversationBatch
  conversation: number
  conversationCount: number
  state: LessonState
  step: LessonStep | undefined
  /** Highest rung the current line may reach right now. */
  cap: RevealLevel
  /**
   * On a check: whether its line's gloss may be echoed in the feedback, i.e.
   * every check on that line has now had its first presentation.
   */
  anchorGloss: boolean
  progress: number
  tally: LessonTally
}

export type HandheldLessonVM = {
  catalog: {
    items: Array<TopikMetadata>
    loading: boolean
    error: string | null
    reload: () => void
  }
  /** Where the learner left off, for the start screen. */
  resume: { topik: TopikMetadata; conversation: number } | null
  /** Set once a topik is chosen, while its file loads. */
  loading: { topikKey: string; error: string | null } | null
  lesson: HandheldLessonView | null
  /**
   * Asked once a lesson is completed, before its closing tally (canon
   * Cor. 3.4). Never gates anything; null outside a lesson.
   */
  survey: {
    pending: boolean
    candidates: Array<StuckCandidate>
    submit: (survey: LessonSurvey) => void
    skip: () => void
  } | null
  audio: {
    available: boolean
    speakingId: string | null
    speak: (message: Message) => void
  }
  select: (topikKey: string) => void
  leave: () => void
  dispatch: (event: LessonEvent) => void
}

export type UseHandheldLessonOptions = {
  /** Injected in tests and stories; defaults to `localStorage`. */
  resumeStore?: ResumeStore
  /** Injected in tests and stories; defaults to `localStorage`. */
  surveyStore?: SurveyStore
}

const lineText = (message: Message): string => message.korean || message.content

function voiceFor(
  adapter: SpeechAdapter
): SpeechAdapter["voices"][number] | undefined {
  return adapter.voices.find((candidate) =>
    candidate.language?.toLowerCase().startsWith(SPOKEN_LANGUAGE)
  )
}

export function useHandheldLesson({
  resumeStore,
  surveyStore,
}: UseHandheldLessonOptions = {}): HandheldLessonVM {
  const { topikRepository, metadataRepository, speechAdapter } =
    useSessionConfig()
  const [store] = useState(() => resumeStore ?? createResumeStore())
  const [surveys] = useState(() => surveyStore ?? createSurveyStore())
  const audioAvailable = speechAdapter?.supported === true

  // ── Catalogue and content ────────────────────────────────────────────────

  const catalogQuery = useTopikMetadataList(metadataRepository)
  const items = useMemo(() => catalogQuery.data ?? [], [catalogQuery.data])

  const [topikKey, setTopikKey] = useState<string | null>(null)
  const batchesQuery = useTopikBatches(topikRepository, topikKey ?? "", {
    enabled: topikKey !== null,
  })
  const batches = topikKey === null ? undefined : batchesQuery.data

  // ── Lesson state ─────────────────────────────────────────────────────────

  const [lesson, setLesson] = useState<LessonState>(() =>
    createLessonState(audioAvailable)
  )
  // The topik whose resume point has been applied to `lesson`.
  const [restoredFor, setRestoredFor] = useState<string | null>(null)

  const contextFor = useCallback(
    (conversation: number): LessonContext => {
      const batch = batches?.[conversation]
      return {
        plan: batch ? planConversation(batch) : EMPTY_PLAN,
        conversationCount: batches?.length ?? 0,
        audio: audioAvailable,
      }
    },
    [batches, audioAvailable]
  )

  // Restore where this topik was left, once its file is here. Adjusted during
  // render rather than in an effect, so the first painted frame is already the
  // resumed line rather than line one followed by a jump.
  if (topikKey !== null && batches && restoredFor !== topikKey) {
    setRestoredFor(topikKey)
    const point = store.get(topikKey)
    let restored = createLessonState(audioAvailable)
    // The conversation is found by its authored id, never by its old
    // position: a file that gained or reordered conversations would otherwise
    // resume - and restore results into - a different one (Thm. 1.1).
    const conversation =
      point?.batchId === undefined
        ? -1
        : batches.findIndex((candidate) => candidate.id === point.batchId)
    if (point && conversation !== -1) {
      const message =
        batches[conversation]?.messages.findIndex(
          (candidate) => candidate.id === point.messageId
        ) ?? -1
      restored = lessonReducer(
        restored,
        {
          type: "RESUME",
          conversation,
          message,
          outcomes: point.outcomes,
        },
        contextFor(conversation)
      )
    }
    setLesson(restored)
  }

  const batch = batches?.[lesson.conversation]

  // ── Survey ───────────────────────────────────────────────────────────────

  // Probes missed on first presentation, per conversation id, across the
  // whole lesson: the survey's stuck candidates (canon Cor. 3.4). The lesson
  // state only holds the current conversation, so they are gathered here.
  const [missed, setMissed] = useState<Record<number, Array<string>>>({})
  const [surveyPending, setSurveyPending] = useState(false)
  const [finishedSeen, setFinishedSeen] = useState(false)

  const missedHere = Object.keys(lesson.firstTry).filter(
    (id) => lesson.firstTry[id] === false
  )
  if (batch && missedHere.some((id) => !missed[batch.id]?.includes(id))) {
    const known = missed[batch.id] ?? []
    setMissed({
      ...missed,
      [batch.id]: [...known, ...missedHere.filter((id) => !known.includes(id))],
    })
  }
  // A lesson just completed asks once; starting over begins a new lesson.
  if (lesson.finished !== finishedSeen) {
    setFinishedSeen(lesson.finished)
    setSurveyPending(lesson.finished)
    if (!lesson.finished) setMissed({})
  }

  const context = useMemo(
    () => contextFor(lesson.conversation),
    [contextFor, lesson.conversation]
  )
  const step = batch ? currentStep(context.plan, lesson) : undefined

  // ── Speech ───────────────────────────────────────────────────────────────

  const [speakingId, setSpeakingId] = useState<string | null>(null)
  const utterance = useRef<AbortController | null>(null)

  const stopSpeaking = useCallback((): void => {
    utterance.current?.abort()
    utterance.current = null
    speechAdapter?.stop()
  }, [speechAdapter])

  const speak = useCallback(
    (message: Message): void => {
      if (!speechAdapter || !audioAvailable) return
      stopSpeaking()
      const controller = new AbortController()
      utterance.current = controller
      speechAdapter
        .speak(lineText(message), {
          signal: controller.signal,
          voice: voiceFor(speechAdapter),
          onStart: () => setSpeakingId(message.id),
        })
        .catch(() => {
          // Cancellation is an AbortError by the adapter's settlement laws; a
          // real failure leaves the line readable, which is the degraded lesson.
        })
        .finally(() => {
          if (utterance.current === controller) utterance.current = null
          setSpeakingId((id) => (id === message.id ? null : id))
        })
    },
    [speechAdapter, audioAvailable, stopSpeaking]
  )

  // Lines speak themselves once the learner has touched the lesson: a tap is
  // what lets a phone play audio at all, and a lesson that talks before being
  // asked to is the other way to lose a learner (Axiom 6.1).
  const armed = useRef(false)
  const lineMessage =
    step?.kind === "line" ? batch?.messages[step.message] : undefined
  // Where a reload lands: the line itself, a first-presentation check's line,
  // or - in the review round - the last line, so a reload does not replay the
  // lines between a missed check's anchor and the end.
  const resumeMessage =
    step?.kind === "check"
      ? batch?.messages[step.repeat ? batch.messages.length - 1 : step.anchor]
      : lineMessage

  useEffect(() => {
    if (!lineMessage || !armed.current) return
    speak(lineMessage)
    return stopSpeaking
  }, [lineMessage, speak, stopSpeaking])

  useEffect(() => stopSpeaking, [stopSpeaking])

  // ── Persistence ──────────────────────────────────────────────────────────

  const batchId = batch?.id

  useEffect(() => {
    if (topikKey === null || restoredFor !== topikKey) return
    if (lesson.finished) {
      store.clear(topikKey)
      return
    }
    // A check resumes at its line, with its result: NEXT then passes over
    // what was already answered instead of asking it twice.
    if (resumeMessage && batchId !== undefined) {
      store.set(topikKey, {
        batchId,
        conversation: lesson.conversation,
        messageId: resumeMessage.id,
        outcomes: outcomesOf(lesson, context.plan),
      })
    }
  }, [store, topikKey, restoredFor, lesson, context, resumeMessage, batchId])

  // ── Actions ──────────────────────────────────────────────────────────────

  const dispatch = useCallback(
    (event: LessonEvent): void => {
      armed.current = true
      setLesson((state) =>
        lessonReducer(
          state,
          event,
          event.type === "RESUME"
            ? contextFor(event.conversation)
            : contextFor(state.conversation)
        )
      )
    },
    [contextFor]
  )

  const select = useCallback((key: string): void => {
    armed.current = true
    setTopikKey(key)
    setRestoredFor(null)
    setMissed({})
    setSurveyPending(false)
  }, [])

  const leave = useCallback((): void => {
    stopSpeaking()
    setTopikKey(null)
    setRestoredFor(null)
    setMissed({})
    setSurveyPending(false)
  }, [stopSpeaking])

  const submitSurvey = useCallback(
    (survey: LessonSurvey): void => {
      if (topikKey !== null) surveys.add(topikKey, survey)
      setSurveyPending(false)
    },
    [surveys, topikKey]
  )

  const skipSurvey = useCallback((): void => setSurveyPending(false), [])

  // ── View ─────────────────────────────────────────────────────────────────

  const displayName = (key: string): string =>
    items.find((item) => item.key === key)?.displayName ?? key

  const last = store.last()
  const resumeTopik = last
    ? items.find((item) => item.key === last.topikKey)
    : undefined

  const ready =
    topikKey !== null && batch !== undefined && restoredFor === topikKey

  return {
    catalog: {
      items,
      loading: catalogQuery.isLoading,
      error: catalogQuery.error ? catalogQuery.error.message : null,
      reload: (): void => void catalogQuery.refetch(),
    },
    resume:
      last && resumeTopik
        ? { topik: resumeTopik, conversation: last.point.conversation }
        : null,
    loading:
      topikKey !== null && !ready
        ? {
            topikKey,
            error: batchesQuery.error
              ? batchesQuery.error.message
              : batches?.length === 0
                ? "This material has no conversations yet."
                : null,
          }
        : null,
    lesson: ready
      ? {
          topikKey,
          displayName: displayName(topikKey),
          batch,
          conversation: lesson.conversation,
          conversationCount: batches?.length ?? 0,
          state: lesson,
          step,
          cap:
            step?.kind === "line" ? revealCap(context.plan, lesson, step) : 2,
          anchorGloss:
            step?.kind === "check" &&
            glossUnlocked(context.plan, lesson, step.anchor),
          progress: progressOf(context.plan, lesson),
          tally: tallyOf(context.plan, lesson),
        }
      : null,
    survey: ready
      ? {
          pending: surveyPending,
          candidates: stuckCandidates(batches ?? [], missed),
          submit: submitSurvey,
          skip: skipSurvey,
        }
      : null,
    audio: { available: audioAvailable, speakingId, speak },
    select,
    leave,
    dispatch,
  }
}
