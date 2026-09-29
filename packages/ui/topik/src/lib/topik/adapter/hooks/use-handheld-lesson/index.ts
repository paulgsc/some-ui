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
import type { PastedLessonStore } from "@topik/lib/topik/adapter/pasted-lesson"
import {
  createPastedLessonStore,
  purgeRetiredLessons,
  serializePastedLesson,
  sessionStorageOrNull,
} from "@topik/lib/topik/adapter/pasted-lesson"
import type { ResumeStore } from "@topik/lib/topik/adapter/resume-point"
import { createResumeStore } from "@topik/lib/topik/adapter/resume-point"
import { useTopikManifest } from "@topik/lib/topik/adapter/server/topik-metadata-queries"
import { useTopikBatches } from "@topik/lib/topik/adapter/server/topik-queries"
import type { SurveyStore } from "@topik/lib/topik/adapter/survey-store"
import { createSurveyStore } from "@topik/lib/topik/adapter/survey-store"
import type { Selection } from "@topik/lib/topik/core/lesson-selection"
import {
  heldLevel,
  orderLessons,
  topikLevelOf,
} from "@topik/lib/topik/core/lesson-selection"
import type {
  LessonSurvey,
  StuckCandidate,
  SurveyItem,
  SurveyReport,
} from "@topik/lib/topik/core/lesson-survey"
import {
  pinMisses,
  stuckCandidates,
  unpinMisses,
} from "@topik/lib/topik/core/lesson-survey"
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
import type { LessonRequest } from "@topik/lib/topik/generation"
import {
  buildLessonPrompt,
  DIGEST_LESSONS,
  surveyDigest,
} from "@topik/lib/topik/generation"
import { LOCAL_LESSON_PREFIX } from "@topik/lib/topik/generation/intake"

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
  /**
   * The served lessons, in the order the learner should meet them (canon
   * Rem. 3.5): ordered by their recent surveys, within the level they hold.
   */
  selection: {
    level: number
    /** The learner moving to another level; the survey never does. */
    chooseLevel: (level: number) => void
    /** At `level`; the first is up next. */
    order: Array<Selection>
    /** Served lessons at other levels, in served order. */
    others: Array<TopikMetadata>
  }
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
  /**
   * The learner's opt-in path (canon Cor. 8.2, 8.3): the prompt goes out to
   * their own model through the clipboard, and the lesson comes back pasted
   * and checked, held for this session only (Rem. 7.4).
   */
  generator: {
    /** The lesson pasted this session, if any; also in `catalog.items`. */
    pasted: TopikMetadata | null
    /**
     * The pasted slot's document, the body "Keep on this account" sends;
     * null with nothing pasted.
     */
    pastedDocument: string | null
    active: boolean
    open: () => void
    close: () => void
    /** The prompt for this request, with the learner's survey digest. */
    prompt: (request: Omit<LessonRequest, "survey">) => string
    /**
     * The prompt reached the learner - the clipboard took it, or they copied
     * it by hand - so the digest's free text is deleted: the prompt carried
     * it. Not before, or a refused clipboard would lose it unsent (Codex,
     * #1555).
     */
    handedOff: (prompt: string) => void
    /**
     * Holds a pasted lesson for this session and starts it. Also how a
     * lesson replayed from the shelf plays: it becomes the pasted lesson.
     */
    start: (meta: TopikMetadata, batches: Array<ConversationBatch>) => void
    /** Lets the pasted lesson go before the session ends. */
    forget: () => void
  }
  /** "This answer looks wrong" on the current check's feedback. */
  flag: { flagged: boolean; toggle: () => void } | null
  select: (topikKey: string) => void
  leave: () => void
  dispatch: (event: LessonEvent) => void
}

export type UseHandheldLessonOptions = {
  /** Injected in tests and stories; defaults to `localStorage`. */
  resumeStore?: ResumeStore
  /** Injected in tests and stories; defaults to `localStorage`. */
  surveyStore?: SurveyStore
  /** Injected in tests and stories; defaults to `sessionStorage`. */
  pastedStore?: PastedLessonStore
  /**
   * Where a pasted lesson's place is kept; defaults to `sessionStorage`. A
   * place lasts exactly as long as its lesson: in `localStorage` it outlived
   * the tab, pointed "Continue" at a lesson that was gone, and handed its
   * progress to the next lesson pasted under the same key (Codex, #1555).
   */
  pastedResumeStore?: ResumeStore
}

export const lineText = (message: Message): string =>
  message.korean || message.content

export function voiceFor(
  adapter: SpeechAdapter
): SpeechAdapter["voices"][number] | undefined {
  return adapter.voices.find((candidate) =>
    candidate.language?.toLowerCase().startsWith(SPOKEN_LANGUAGE)
  )
}

export function useHandheldLesson({
  resumeStore,
  surveyStore,
  pastedStore,
  pastedResumeStore,
}: UseHandheldLessonOptions = {}): HandheldLessonVM {
  const { topikRepository, metadataRepository, speechAdapter } =
    useSessionConfig()
  const [store] = useState(() => {
    const points = resumeStore ?? createResumeStore()
    // Places left in pasted lessons by builds that kept them in
    // `localStorage` go with those lessons (Rem. 7.4): they would hold
    // outcomes and flags for good, and one left as `last` would hide the
    // served lesson "Continue" should offer (Codex, #1555). Done before the
    // first render reads `last`.
    points.clearWhere((key) => key.startsWith(LOCAL_LESSON_PREFIX))
    return points
  })
  const [surveys] = useState(() => surveyStore ?? createSurveyStore())
  const [held] = useState(() => pastedStore ?? createPastedLessonStore())
  const [sessionPoints] = useState(
    () => pastedResumeStore ?? createResumeStore(sessionStorageOrNull())
  )
  const audioAvailable = speechAdapter?.supported === true

  // ── Catalogue and content ────────────────────────────────────────────────

  // In the manifest's own order: it is the operator's, and selection falls
  // back to it (canon Rem. 3.5). The sorted list the desktop picker reads
  // would put the alphabetically first lesson up next (Codex, #1555).
  const catalogQuery = useTopikManifest(metadataRepository)
  const served = useMemo(
    () => catalogQuery.data?.topiks ?? [],
    [catalogQuery.data]
  )
  // The lesson pasted this session comes first; served material follows. A
  // pasted lesson's key never reaches the server.
  const [pasted, setPasted] = useState(() => held.get())
  const items = useMemo(
    () => [...(pasted ? [pasted.meta] : []), ...served],
    [pasted, served]
  )
  // Re-read after every write, so selection sees the report just added, and
  // whenever the learner comes back to the list or the tab: a report expires
  // by the clock, and a tab left open for days would otherwise keep ordering
  // by it (Codex, #1555).
  const [reports, setReports] = useState(() => surveys.list())
  useEffect(() => {
    const refresh = (): void => {
      if (document.visibilityState === "visible") setReports(surveys.list())
    }
    document.addEventListener("visibilitychange", refresh)
    return (): void => document.removeEventListener("visibilitychange", refresh)
  }, [surveys])

  // Lessons were once kept in `localStorage` for good; what that left on the
  // device goes, so pasted lessons really last the session (Rem. 7.4).
  useEffect(() => {
    purgeRetiredLessons()
  }, [])

  const [topikKey, setTopikKey] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const isLocal = topikKey?.startsWith(LOCAL_LESSON_PREFIX) === true
  // Where this lesson's place is kept: with the lesson (canon Rem. 7.4).
  const points = isLocal ? sessionPoints : store
  const batchesQuery = useTopikBatches(topikRepository, topikKey ?? "", {
    enabled: topikKey !== null && !isLocal,
  })
  const localBatches =
    isLocal && pasted?.meta.key === topikKey ? pasted.batches : undefined
  const batches =
    topikKey === null ? undefined : isLocal ? localBatches : batchesQuery.data

  // ── Lesson state ─────────────────────────────────────────────────────────

  // Probes missed on first presentation, per conversation id, across the
  // whole lesson: the survey's stuck candidates (canon Cor. 3.4). The lesson
  // state only holds the current conversation, so they are gathered here.
  // Each is pinned (`id@fp`) to the probe as it was when missed, and never
  // re-pinned: the file can refresh mid-lesson, and a miss re-pinned to a
  // revised probe would report content the learner never missed (Codex,
  // #1554).
  const [missed, setMissed] = useState<Record<number, Array<string>>>({})
  const [surveyPending, setSurveyPending] = useState(false)
  const [finishedSeen, setFinishedSeen] = useState(false)
  // Answers the learner flagged as keyed wrong during this lesson; they ride
  // the survey into the next prompt, and survive its being skipped.
  const [flagged, setFlagged] = useState<Array<SurveyItem>>([])

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
    const point = points.get(topikKey)
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
      // The survey's evidence from the conversations before this one: the
      // outcomes only cover this one (Codex, #1554).
      if (point.survey) {
        setMissed(point.survey.missed)
        setFlagged(point.survey.flagged)
      }
    }
    setLesson(restored)
  }

  const batch = batches?.[lesson.conversation]

  // ── Survey ───────────────────────────────────────────────────────────────

  const missedHere = Object.keys(lesson.firstTry).filter(
    (id) => lesson.firstTry[id] === false
  )
  // Only once `lesson` is this topik's: on the render that restores a point,
  // it is still the previous lesson's state. The merge is an updater so a
  // restore's own setMissed, queued in the same render, is never overwritten
  // (Codex, #1554).
  const pinnedIds = (keys: Array<string> = []): Array<string> =>
    keys.map((key) => key.slice(0, key.lastIndexOf("@")))
  if (
    batch &&
    restoredFor === topikKey &&
    missedHere.some((id) => !pinnedIds(missed[batch.id]).includes(id))
  ) {
    const batchId = batch.id
    // Pinned now, against the probe just answered; an id already held keeps
    // the pin it was missed under.
    const pinned = pinMisses([batch], { [batchId]: missedHere })[batchId] ?? []
    setMissed((current) => {
      const known = pinnedIds(current[batchId])
      return {
        ...current,
        [batchId]: [
          ...(current[batchId] ?? []),
          ...pinned.filter((key) => !known.includes(pinnedIds([key])[0] ?? "")),
        ],
      }
    })
  }
  // A lesson just completed asks once; starting over begins a new lesson.
  if (lesson.finished !== finishedSeen) {
    setFinishedSeen(lesson.finished)
    setSurveyPending(lesson.finished)
    if (!lesson.finished) {
      setMissed({})
      setFlagged([])
    }
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
    // A finished lesson's place goes once its survey is answered or skipped,
    // not before: a reload or a leave while the survey is open would restart
    // the lesson and lose what the survey was about to offer (Codex, #1554).
    // Until then the point left before finishing stands.
    if (lesson.finished) {
      if (!surveyPending) points.clear(topikKey)
      return
    }
    // A check resumes at its line, with its result: NEXT then passes over
    // what was already answered instead of asking it twice.
    if (resumeMessage && batchId !== undefined) {
      points.set(topikKey, {
        batchId,
        conversation: lesson.conversation,
        messageId: resumeMessage.id,
        outcomes: outcomesOf(lesson, context.plan),
        survey: { missed, flagged },
      })
    }
  }, [
    points,
    topikKey,
    restoredFor,
    surveyPending,
    lesson,
    context,
    resumeMessage,
    batchId,
    missed,
    flagged,
  ])

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
    setGenerating(false)
    setTopikKey(key)
    setRestoredFor(null)
    setMissed({})
    setFlagged([])
    setSurveyPending(false)
    setFinishedSeen(false)
  }, [])

  // Leaving clears what is held in memory; the resume point already holds the
  // survey's evidence, and a resumed lesson restores it.
  const leave = useCallback((): void => {
    stopSpeaking()
    setTopikKey(null)
    setRestoredFor(null)
    setMissed({})
    setFlagged([])
    setSurveyPending(false)
    setFinishedSeen(false)
    setReports(surveys.list())
  }, [stopSpeaking, surveys])

  const last = store.last()
  const resumeTopik = last
    ? items.find((item) => item.key === last.topikKey)
    : undefined

  // The level the learner holds, until they choose another (Rem. 3.3: the
  // survey never moves it).
  const [chosenLevel, setChosenLevel] = useState<number | null>(null)
  const level = chosenLevel ?? heldLevel(reports, resumeTopik)

  const current =
    topikKey === null ? undefined : items.find((item) => item.key === topikKey)
  const lessonName = current?.displayName
  // A lesson with no level tag suits any level, and was played at the one
  // the learner held: that is the level its report carries, or the next
  // visit would fall back to the last lesson left, or to 1 (Codex, #1555).
  const lessonLevel = topikLevelOf(current?.tags) ?? level

  const submitSurvey = useCallback(
    (survey: LessonSurvey): void => {
      if (topikKey !== null) {
        surveys.add(
          topikKey,
          { ...survey, flagged },
          { displayName: lessonName, level: lessonLevel }
        )
        setReports(surveys.list())
      }
      setSurveyPending(false)
    },
    [surveys, topikKey, flagged, lessonName, lessonLevel]
  )

  // Skipping the survey drops its answers, not the learner's flags: a flag
  // was a deliberate tap, and the next prompt should hear it.
  const skipSurvey = useCallback((): void => {
    if (topikKey !== null && flagged.length > 0) {
      surveys.add(
        topikKey,
        { stuck: [], flagged },
        { displayName: lessonName, level: lessonLevel }
      )
      setReports(surveys.list())
    }
    setSurveyPending(false)
  }, [surveys, topikKey, flagged, lessonName, lessonLevel])

  const flaggable =
    step?.kind === "check" && lesson.answered !== null && batch
      ? { batch, step }
      : null
  const flagItem: SurveyItem | null = ((): SurveyItem | null => {
    if (!flaggable) return null
    const probe = flaggable.batch.probes?.[flaggable.step.probe]
    const anchor = flaggable.batch.messages[flaggable.step.anchor]
    return {
      batchId: flaggable.batch.id,
      probeId: flaggable.step.id,
      source: probe?.source ?? (anchor ? lineText(anchor) : undefined),
      prompt: probe?.prompt,
    }
  })()
  const isFlagged =
    flagItem !== null &&
    flagged.some(
      (item) =>
        item.batchId === flagItem.batchId && item.probeId === flagItem.probeId
    )
  const toggleFlag = (): void => {
    if (!flagItem) return
    setFlagged((current) =>
      isFlagged
        ? current.filter(
            (item) =>
              item.batchId !== flagItem.batchId ||
              item.probeId !== flagItem.probeId
          )
        : [...current, flagItem]
    )
  }

  const startPasted = useCallback(
    (meta: TopikMetadata, lessonBatches: Array<ConversationBatch>): void => {
      held.set(meta, lessonBatches)
      // A newly pasted lesson starts fresh, whatever an earlier one under the
      // same key left behind (Codex, #1554).
      sessionPoints.clear(meta.key)
      setPasted({ meta, batches: lessonBatches })
      select(meta.key)
    },
    [held, sessionPoints, select]
  )

  const forgetPasted = useCallback((): void => {
    if (pasted) sessionPoints.clear(pasted.meta.key)
    held.clear()
    setPasted(null)
  }, [held, pasted, sessionPoints])

  // Each prompt built, and the reports its digest was made from. A handoff
  // names the prompt it handed off, so it forgets what that prompt carried
  // and nothing else - not the reports of a later prompt, built while an
  // earlier one was still on screen to copy (Codex, #1555).
  const carried = useRef(new Map<string, Array<SurveyReport>>())

  const prompt = useCallback(
    (request: Omit<LessonRequest, "survey">): string => {
      const digest = surveys.list().slice(0, DIGEST_LESSONS)
      const text = buildLessonPrompt({
        ...request,
        survey: surveyDigest(digest, DIGEST_LESSONS),
      })
      carried.current.set(text, digest)
      return text
    },
    [surveys]
  )

  // The digest's free text has now reached the learner; it is not kept to
  // say it twice (canon Rem. 7.4).
  const promptHandedOff = useCallback(
    (text: string): void => {
      const reports = carried.current.get(text)
      if (!reports) return
      carried.current.delete(text)
      surveys.forgetBecoming(reports)
      setReports(surveys.list())
    },
    [surveys]
  )

  // ── View ─────────────────────────────────────────────────────────────────

  const displayName = (key: string): string =>
    items.find((item) => item.key === key)?.displayName ?? key

  const order = useMemo(
    () => orderLessons(served, reports, level),
    [served, reports, level]
  )
  const others = useMemo(
    () =>
      served.filter((item) => {
        const itemLevel = topikLevelOf(item.tags)
        return itemLevel !== undefined && itemLevel !== level
      }),
    [served, level]
  )

  const ready =
    topikKey !== null && batch !== undefined && restoredFor === topikKey

  const pastedDocument = useMemo(
    () => (pasted ? serializePastedLesson(pasted.meta, pasted.batches) : null),
    [pasted]
  )

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
            error:
              isLocal && localBatches === undefined
                ? "A pasted lesson lasts only the session it was pasted in."
                : batchesQuery.error
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
          // Only the misses whose probe is still the version missed.
          candidates: stuckCandidates(
            batches ?? [],
            unpinMisses(batches ?? [], missed)
          ),
          submit: submitSurvey,
          skip: skipSurvey,
        }
      : null,
    selection: {
      level,
      chooseLevel: setChosenLevel,
      order,
      others,
    },
    generator: {
      pasted: pasted?.meta ?? null,
      pastedDocument,
      active: generating && topikKey === null,
      open: (): void => setGenerating(true),
      close: (): void => setGenerating(false),
      prompt,
      handedOff: promptHandedOff,
      start: startPasted,
      forget: forgetPasted,
    },
    flag: flagItem ? { flagged: isFlagged, toggle: toggleFlag } : null,
    audio: { available: audioAvailable, speakingId, speak },
    select,
    leave,
    dispatch,
  }
}
